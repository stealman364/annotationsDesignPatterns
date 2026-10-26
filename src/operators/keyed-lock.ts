import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import type { OverlapKeyContext } from './overlap-types';

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

export type KeyedLockKeyContext<This, Args extends readonly unknown[]> = OverlapKeyContext<
  This,
  Args
>;

export interface KeyedLockOptions<This, Args extends readonly unknown[]> {
  /** Resolves the mutually exclusive partition for this invocation. */
  readonly key: (context: KeyedLockKeyContext<This, Args>) => PropertyKey;
  /** Maximum waiting calls per key. The active holder is not counted. */
  readonly maxQueue?: number;
}

/**
 * Error lanzado cuando la cola de espera de un candado con clave
 * alcanza su límite configurado.
 */
export class KeyedLockQueueFullError extends PolicyError {
  readonly key: PropertyKey;

  constructor(
    key: PropertyKey,
    message = 'The keyed lock queue is full',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'KEYED_LOCK_QUEUE_FULL' });
    this.name = 'KeyedLockQueueFullError';
    this.key = key;
  }
}

interface NormalizedKeyedLockOptions<This, Args extends readonly unknown[]> {
  readonly key: KeyedLockOptions<This, Args>['key'];
  readonly maxQueue: number;
}

interface Invocation<This, Args extends readonly unknown[], Result> {
  readonly receiver: This;
  readonly context: RuntimeOperationContext<This, Args> | undefined;
  readonly args: Args;
  readonly resolve?: (value: Result | PromiseLike<Result>) => void;
  readonly reject?: (reason?: unknown) => void;
  detachAbortListener(): void;
}

interface LockState<This, Args extends readonly unknown[], Result> {
  active: boolean;
  draining: boolean;
  readonly queued: Array<Invocation<This, Args, Result>>;
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

function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new Error('Keyed lock wait aborted') : signal.reason;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function normalizeOptions<This, Args extends readonly unknown[]>(
  options: KeyedLockOptions<This, Args>,
): NormalizedKeyedLockOptions<This, Args> {
  if (typeof options.key !== 'function') {
    throw new TypeError('keyedLock requires a key resolver');
  }
  if (
    options.maxQueue !== undefined &&
    (!Number.isInteger(options.maxQueue) || options.maxQueue < 0)
  ) {
    throw new RangeError('keyedLock requires maxQueue to be a non-negative integer');
  }

  return {
    key: options.key,
    maxQueue: options.maxQueue ?? Number.POSITIVE_INFINITY,
  };
}

function createKeyContext<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
): KeyedLockKeyContext<This, Args> {
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
  options: NormalizedKeyedLockOptions<This, Args>,
): PropertyKey {
  return context?.key ?? options.key(createKeyContext(receiver, args, context));
}

/**
 * Serializes executions sharing a resolver key. It owns a FIFO queue per key;
 * a waiting invocation can withdraw through the invocation AbortSignal.
 */
export function keyedLock<This, Args extends readonly unknown[], Result>(
  options: KeyedLockOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  const normalized = normalizeOptions(options);
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const states = new Map<PropertyKey, LockState<This, Args, Result>>();

    return function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const key = resolveKey(this, args, context, normalized);
      const state = states.get(key) ?? { active: false, draining: false, queued: [] };
      states.set(key, state);

      const cleanState = (): void => {
        if (!state.active && state.queued.length === 0 && states.get(key) === state) {
          states.delete(key);
        }
      };

      const complete = (entry: Invocation<This, Args, Result>): void => {
        entry.detachAbortListener();
        emitPolicyEvent(entry.context, 'keyedLock', 'keyedLock.released', { key });
        startNext();
      };

      const invoke = (entry: Invocation<This, Args, Result>): MaybePromise<Result> | undefined => {
        entry.detachAbortListener();
        if (entry.context?.signal?.aborted === true) {
          const error = abortReason(entry.context.signal);
          if (entry.reject !== undefined) {
            entry.reject(error);
            startNext();
            return undefined;
          }
          state.active = false;
          cleanState();
          return Promise.reject(error);
        }

        state.active = true;
        emitPolicyEvent(entry.context, 'keyedLock', 'keyedLock.acquired', { key });

        try {
          const result = next.call(entry.receiver, entry.context, ...entry.args);
          if (isPromiseLike(result)) {
            void Promise.resolve(result).then(
              (value) => {
                entry.resolve?.(value);
                complete(entry);
              },
              (error: unknown) => {
                entry.reject?.(error);
                complete(entry);
              },
            );
            return result;
          }

          entry.resolve?.(result);
          complete(entry);
          return result;
        } catch (error) {
          entry.reject?.(error);
          complete(entry);
          if (entry.reject === undefined) {
            throw error;
          }
          return undefined;
        }
      };

      const startNext = (): void => {
        if (state.draining) {
          return;
        }

        state.draining = true;
        try {
          while (true) {
            const entry = state.queued.shift();
            if (entry === undefined) {
              state.active = false;
              cleanState();
              return;
            }

            const result = invoke(entry);
            if (result !== undefined && isPromiseLike(result)) {
              return;
            }
          }
        } finally {
          state.draining = false;
        }
      };

      const activeInvocation: Invocation<This, Args, Result> = {
        receiver: this,
        context,
        args,
        detachAbortListener(): void {
          // The active holder is not forcibly released by an abort signal.
        },
      };

      if (!state.active) {
        return invoke(activeInvocation) as MaybePromise<Result>;
      }

      if (state.queued.length >= normalized.maxQueue) {
        return Promise.reject(new KeyedLockQueueFullError(key));
      }

      return new Promise<Result>((resolve, reject) => {
        const signal = context?.signal;
        let removed = false;
        let listener: (() => void) | undefined;
        const detachAbortListener = (): void => {
          if (listener !== undefined) {
            signal?.removeEventListener('abort', listener);
            listener = undefined;
          }
        };
        const entry: Invocation<This, Args, Result> = {
          receiver: this,
          context,
          args,
          resolve,
          reject,
          detachAbortListener,
        };
        listener = (): void => {
          if (removed) {
            return;
          }
          const index = state.queued.indexOf(entry);
          if (index === -1) {
            return;
          }
          removed = true;
          state.queued.splice(index, 1);
          detachAbortListener();
          reject(signal === undefined ? new Error('Keyed lock wait aborted') : abortReason(signal));
          cleanState();
        };

        if (signal !== undefined && isAborted(signal)) {
          removed = true;
          reject(abortReason(signal));
          cleanState();
          return;
        }

        state.queued.push(entry);
        signal?.addEventListener('abort', listener, { once: true });
        if (signal !== undefined && isAborted(signal)) {
          listener();
          return;
        }
        emitPolicyEvent(context, 'keyedLock', 'keyedLock.queued', { key });
      });
    };
  };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'keyedLock',
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
