import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
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

interface QueuedInvocation<This, Args extends readonly unknown[], Result> {
  readonly receiver: This;
  readonly context: RuntimeOperationContext<This, Args> | undefined;
  readonly args: Args;
  readonly resolve: (value: Result | PromiseLike<Result>) => void;
  readonly reject: (reason?: unknown) => void;
}

interface QueueState<This, Args extends readonly unknown[], Result> {
  active: boolean;
  draining: boolean;
  readonly queued: Array<QueuedInvocation<This, Args, Result>>;
}

interface SharedReservation<Result> {
  readonly promise: Promise<Result>;
  reject(reason?: unknown): void;
  resolve(value: Result | PromiseLike<Result>): void;
}

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
  if (
    options.maxQueue !== undefined &&
    (!Number.isInteger(options.maxQueue) || options.maxQueue < 0)
  ) {
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

export function overlap<This, Args extends readonly unknown[], Result>(
  options: OverlapOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  const normalized = normalizeOverlapOptions(options);
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const active = new Map<PropertyKey, PromiseLike<Result>>();
    const queues = new Map<PropertyKey, QueueState<This, Args, Result>>();

    const createQueueWrapper = function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const key = resolveKey(this, args, context, normalized);
      const state = queues.get(key) ?? { active: false, draining: false, queued: [] };
      queues.set(key, state);

      const emitStarted = (entryContext: RuntimeOperationContext<This, Args> | undefined): void => {
        emitPolicyEvent(entryContext, 'overlap', 'overlap.started', { key });
      };
      const emitCompleted = (
        entryContext: RuntimeOperationContext<This, Args> | undefined,
      ): void => {
        emitPolicyEvent(entryContext, 'overlap', 'overlap.completed', { key });
      };

      const startQueued = (): void => {
        if (state.draining) {
          return;
        }

        state.draining = true;
        try {
          while (true) {
            const entry = state.queued.shift();
            if (entry === undefined) {
              state.active = false;
              if (queues.get(key) === state) {
                queues.delete(key);
              }
              return;
            }

            emitStarted(entry.context);
            try {
              const result = next.call(entry.receiver, entry.context, ...entry.args);
              if (isPromiseLike(result)) {
                void Promise.resolve(result).then(
                  (value) => {
                    entry.resolve(value);
                    emitCompleted(entry.context);
                    startQueued();
                  },
                  (error: unknown) => {
                    entry.reject(error);
                    emitCompleted(entry.context);
                    startQueued();
                  },
                );
                return;
              }
              entry.resolve(result);
              emitCompleted(entry.context);
            } catch (error) {
              entry.reject(error);
              emitCompleted(entry.context);
            }
          }
        } finally {
          state.draining = false;
        }
      };

      const completeActive = (): void => {
        emitCompleted(context);
        startQueued();
      };

      if (state.active) {
        if (state.queued.length >= normalized.maxQueue) {
          emitPolicyEvent(context, 'overlap', 'overlap.dropped', { key });
          return Promise.reject(new OverlapQueueFullError(key));
        }
        emitPolicyEvent(context, 'overlap', 'overlap.queued', { key });
        return new Promise<Result>((resolve, reject) => {
          state.queued.push({ receiver: this, context, args, resolve, reject });
        });
      }

      state.active = true;
      emitStarted(context);
      try {
        const result = next.call(this, context, ...args);
        if (isPromiseLike(result)) {
          void Promise.resolve(result).then(completeActive, completeActive);
          return result;
        }
        completeActive();
        return result;
      } catch (error) {
        completeActive();
        throw error;
      }
    };

    const createDropOrShareWrapper = function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const key = resolveKey(this, args, context, normalized);
      const inFlight = active.get(key);
      if (inFlight !== undefined) {
        if (normalized.mode === 'share') {
          return inFlight;
        }
        emitPolicyEvent(context, 'overlap', 'overlap.dropped', { key });
        return Promise.reject(new OverlapDroppedError(key));
      }

      const shared = normalized.mode === 'share' ? createSharedReservation<Result>() : undefined;
      // Reserve the key before entering user work. Besides drop, this lets a
      // reentrant share call receive the canonical promise while the first
      // invocation has not yet produced its own asynchronous result.
      const reservation = shared?.promise ?? new Promise<Result>(() => undefined);
      active.set(key, reservation);
      emitPolicyEvent(context, 'overlap', 'overlap.started', { key });
      const complete = (): void => {
        if (active.get(key) === reservation) {
          active.delete(key);
        }
        emitPolicyEvent(context, 'overlap', 'overlap.completed', { key });
      };
      try {
        const result = next.call(this, context, ...args);
        if (!isPromiseLike(result)) {
          shared?.resolve(result);
          complete();
          return result;
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
        return shared?.promise ?? result;
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
