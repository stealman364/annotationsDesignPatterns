import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { raceWithSignal, sharedContext } from '../core/cancellation';
import { assertObjectReceiver } from '../core/receiver';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import { CacheHandleStore, type CacheHandle } from './cache-handle';

export interface MemoizeOperatorOptions<Args extends readonly unknown[]> {
  readonly key?: (...args: Args) => string;
  /** Isolate entries by object/function receiver identity. Opt-in, without handles. */
  readonly perReceiver?: boolean;
}

export interface MemoizeWithHandle<This, Args extends readonly unknown[], Result> {
  readonly handle: CacheHandle;
  readonly operator: Operator<This, Args, Result, Result>;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<unknown>).then === 'function'
    );
  } catch {
    return true;
  }
}

function createWrapper<This, Args extends readonly unknown[], Result>(
  next: ContextualMethod<This, Args, Result>,
  options: MemoizeOperatorOptions<Args>,
  sharedCache: CacheHandleStore<MaybePromise<Result>>,
): ContextualMethod<This, Args, Result> {
  const key = options.key ?? ((...args: Args) => JSON.stringify(args));
  const receiverCaches =
    options.perReceiver === true
      ? new WeakMap<object, CacheHandleStore<MaybePromise<Result>>>()
      : undefined;

  return function (
    this: This,
    context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): MaybePromise<Result> {
    if (context?.signal !== undefined && Boolean(context.signal.aborted))
      return Promise.reject(context.signal.reason);
    let cache = sharedCache;
    if (receiverCaches !== undefined) {
      assertObjectReceiver(this, 'memoize perReceiver');
      let receiverCache = receiverCaches.get(this);
      if (receiverCache === undefined) {
        receiverCache = new CacheHandleStore<MaybePromise<Result>>('memoize');
        receiverCaches.set(this, receiverCache);
      }
      cache = receiverCache;
    }
    const cacheKey = key(...args);
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      emitPolicyEvent(context, 'memoize', 'cache.hit', {});
      return raceWithSignal(cached.value, context?.signal);
    }

    emitPolicyEvent(context, 'memoize', 'cache.miss', {});
    if (context?.signal !== undefined && Boolean(context.signal.aborted))
      return Promise.reject(context.signal.reason);
    const result = next.call(this, sharedContext(context), ...args);
    const replacement = cache.set(cacheKey, result, context);
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch((error: unknown) => {
        if (cache.deleteIfCurrent(cacheKey, replacement)) {
          emitPolicyEvent(replacement.context, 'memoize', 'cache.rejected', { error });
        }
      });
    }
    return raceWithSignal(result, context?.signal);
  };
}

function createMemoizeOperator<This, Args extends readonly unknown[], Result>(
  options: MemoizeOperatorOptions<Args>,
  createCache: () => CacheHandleStore<MaybePromise<Result>>,
  withHandle = false,
): Operator<This, Args, Result, Result> {
  const perReceiver = options.perReceiver;
  if (perReceiver !== undefined && typeof perReceiver !== 'boolean') {
    throw new TypeError('memoize requires perReceiver to be a boolean');
  }
  if (withHandle && perReceiver === true) {
    throw new TypeError('memoizeWithHandle does not support perReceiver');
  }
  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'memoize',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const wrapper = createWrapper(
        function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        },
        { key: options.key, perReceiver },
        createCache(),
      );
      return withoutContext(wrapper);
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next, { key: options.key, perReceiver }, createCache());
    },
  };

  return operator;
}

/** Creates a per-applied-method memoization operator, preserving legacy semantics. */
export function memoize<This, Args extends readonly unknown[], Result>(
  options: MemoizeOperatorOptions<Args> = {},
): Operator<This, Args, Result, Result> {
  return createMemoizeOperator(
    options,
    () => new CacheHandleStore<MaybePromise<Result>>('memoize'),
  );
}

/**
 * Creates an opt-in memoization cache with an explicit invalidation handle.
 * The cache is shared by applications of this returned operator only.
 */
export function memoizeWithHandle<This, Args extends readonly unknown[], Result>(
  options: Omit<MemoizeOperatorOptions<Args>, 'perReceiver'> = {},
): MemoizeWithHandle<This, Args, Result> {
  const cache = new CacheHandleStore<MaybePromise<Result>>('memoize');
  return Object.freeze({
    handle: cache.handle,
    operator: createMemoizeOperator(options, () => cache, true),
  });
}
