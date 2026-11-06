import { isCount } from '../core/numeric';
import { PermitQueue, type Release } from '../core/permit-queue';
import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { raceWithSignal, sharedContext } from '../core/cancellation';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import type { OverlapKeyContext, OverlapOptions } from './overlap-types';

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

interface NormalizedOverlapOptions<This, Args extends readonly unknown[]> {
  readonly mode: OverlapOptions<This, Args>['mode'];
  readonly key: OverlapOptions<This, Args>['key'];
  readonly maxQueue: number;
}

interface SharedReservation<Result> {
  readonly promise: Promise<Result>;
  reject(reason?: unknown): void;
  resolve(value: Result | PromiseLike<Result>): void;
}

/**
 * Error lanzado cuando una invocación se descarta por solapamiento
 * en modo `'drop'`.
 */
export class OverlapDroppedError extends PolicyError {
  readonly key: PropertyKey;

  constructor(
    key: PropertyKey,
    message = 'An overlapping invocation was dropped',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'OVERLAP_DROPPED' });
    this.name = 'OverlapDroppedError';
    this.key = key;
  }
}

/**
 * Error lanzado cuando la cola de espera de un solapamiento alcanza
 * su límite configurado en modo `'queue'`.
 */
export class OverlapQueueFullError extends PolicyError {
  readonly key: PropertyKey;

  constructor(
    key: PropertyKey,
    message = 'The overlap queue is full',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'OVERLAP_QUEUE_FULL' });
    this.name = 'OverlapQueueFullError';
    this.key = key;
  }
}

function isPromiseLike<Result>(value: MaybePromise<Result>): value is PromiseLike<Result> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<Result>).then === 'function'
    );
  } catch {
    return true;
  }
}

function createSharedReservation<Result>(): SharedReservation<Result> {
  let resolvePromise: ((value: Result | PromiseLike<Result>) => void) | undefined;
  let rejectPromise: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Result>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // The reservation is also used while the first call is still entering its
  // body. A synchronous throw with no reentrant consumer must not create an
  // unhandled rejection, while consumers still receive this same promise.
  void promise.catch(() => undefined);

  return {
    promise,
    reject(reason?: unknown): void {
      rejectPromise?.(reason);
    },
    resolve(value: Result | PromiseLike<Result>): void {
      resolvePromise?.(value);
    },
  };
}

function normalizeOverlapOptions<This, Args extends readonly unknown[]>(
  options: OverlapOptions<This, Args>,
): NormalizedOverlapOptions<This, Args> {
  if (options.mode !== 'drop' && options.mode !== 'share' && options.mode !== 'queue') {
    throw new RangeError('overlap requires mode to be drop, share, or queue');
  }
  if (typeof options.key !== 'function') {
    throw new TypeError('overlap requires a key resolver');
  }
  if (options.maxQueue !== undefined && !isCount(options.maxQueue, 0)) {
    throw new RangeError('overlap requires maxQueue to be a non-negative integer');
  }

  return {
    mode: options.mode,
    key: options.key,
    maxQueue: options.maxQueue ?? Number.POSITIVE_INFINITY,
  };
}

function createKeyContext<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
): OverlapKeyContext<This, Args> {
  if (context !== undefined) {
    return context;
  }

  return Object.freeze({
    receiver,
    args: Object.freeze([...args]) as unknown as Args,
    key: undefined,
    operationId: undefined,
    metadata: emptyMetadata,
    signal: undefined,
  });
}

function resolveKey<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
  options: NormalizedOverlapOptions<This, Args>,
): PropertyKey {
  return context?.key ?? options.key(createKeyContext(receiver, args, context));
}

/**
 * Controla invocaciones superpuestas por clave resuelta en tiempo de ejecución.
 * En modo `'drop'` descarta las nuevas; en `'share'` devuelve el resultado activo;
 * en `'queue'` espera en FIFO.
 *
 * @param options configuración con `mode`, `key` para particionar estado, y `maxQueue` opcional.
 * @returns operador que coordina superpposiciones por clave.
 *
 * @example
 * ```ts
 * const op = overlap({
 *   mode: 'queue',
 *   key: (ctx) => ctx.receiver.constructor.name,
 *   maxQueue: 10,
 * });
 * ```
 */
export function overlap<This, Args extends readonly unknown[], Result>(
  options: OverlapOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  const normalized = normalizeOverlapOptions(options);
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const active = new Map<PropertyKey, { promise: PromiseLike<Result>; joined: boolean }>();
    const queues = new Map<PropertyKey, PermitQueue>();

    const createQueueWrapper = function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      if (context?.signal?.aborted === true) return Promise.reject(context.signal.reason);
      const key = resolveKey(this, args, context, normalized);
      const queue = queues.get(key) ?? new PermitQueue(1, normalized.maxQueue);
      queues.set(key, queue);
      const clean = (): void => {
        if (queue.isIdle && queues.get(key) === queue) queues.delete(key);
      };
      const execute = (release: Release): MaybePromise<Result> => {
        if (context?.signal?.aborted === true) {
          release();
          clean();
          return Promise.reject(context.signal.reason);
        }
        emitPolicyEvent(context, 'overlap', 'overlap.started', { key });
        const complete = (): void => {
          emitPolicyEvent(context, 'overlap', 'overlap.completed', { key });
          release();
          clean();
        };
        try {
          // An event sink may abort after admission but before user work.
          if (context?.signal !== undefined && Boolean(context.signal.aborted)) {
            complete();
            return Promise.reject(context.signal.reason);
          }
          const result = next.call(this, context, ...args);
          if (isPromiseLike(result)) {
            // Cancellation stops this caller waiting, while permit ownership
            // lasts until the actual inner execution settles.
            void Promise.resolve(result).then(complete, complete);
            return raceWithSignal(result, context?.signal);
          }
          complete();
          return raceWithSignal(result, context?.signal);
        } catch (error) {
          complete();
          if (context?.signal !== undefined && Boolean(context.signal.aborted))
            return Promise.reject(context.signal.reason);
          throw error;
        }
      };
      const acquired = queue.acquire(context?.signal, () => {
        emitPolicyEvent(context, 'overlap', 'overlap.queued', { key });
      });
      if (acquired === undefined) {
        emitPolicyEvent(context, 'overlap', 'overlap.dropped', { key });
        return Promise.reject(new OverlapQueueFullError(key));
      }
      if (typeof acquired === 'function') return execute(acquired);
      return acquired.then(execute, (error: unknown) => {
        clean();
        throw error;
      });
    };

    const createDropOrShareWrapper = function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      if (context?.signal !== undefined && Boolean(context.signal.aborted))
        return Promise.reject(context.signal.reason);
      const key = resolveKey(this, args, context, normalized);
      const inFlight = active.get(key);
      if (inFlight !== undefined) {
        if (normalized.mode === 'share') {
          inFlight.joined = true;
          return raceWithSignal(inFlight.promise, context?.signal);
        }
        emitPolicyEvent(context, 'overlap', 'overlap.dropped', { key });
        return Promise.reject(new OverlapDroppedError(key));
      }

      const shared = normalized.mode === 'share' ? createSharedReservation<Result>() : undefined;
      // Reserve the key before entering user work. Besides drop, this lets a
      // reentrant share call receive the canonical promise while the first
      // invocation has not yet produced its own asynchronous result.
      const reservation = shared?.promise ?? new Promise<Result>(() => undefined);
      const running = { promise: reservation, joined: false };
      active.set(key, running);
      emitPolicyEvent(context, 'overlap', 'overlap.started', { key });
      const complete = (): void => {
        if (active.get(key) === running) {
          active.delete(key);
        }
        emitPolicyEvent(context, 'overlap', 'overlap.completed', { key });
      };
      try {
        if (context?.signal !== undefined && Boolean(context.signal.aborted) && !running.joined) {
          shared?.reject(context.signal.reason);
          complete();
          return Promise.reject(context.signal.reason);
        }
        const result = next.call(
          this,
          normalized.mode === 'share' ? sharedContext(context) : context,
          ...args,
        );
        if (!isPromiseLike(result)) {
          shared?.resolve(result);
          complete();
          return raceWithSignal(result, context?.signal);
        }
        void Promise.resolve(result).then(
          (value) => {
            shared?.resolve(value);
            complete();
          },
          (error: unknown) => {
            shared?.reject(error);
            complete();
          },
        );
        return raceWithSignal(shared?.promise ?? result, context?.signal);
      } catch (error) {
        shared?.reject(error);
        complete();
        throw error;
      }
    };

    return normalized.mode === 'queue' ? createQueueWrapper : createDropOrShareWrapper;
  };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'overlap',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createWrapper(function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        }),
      );
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next);
    },
  };

  return operator;
}
