import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import { CacheHandleStore, type CacheHandle } from './cache-handle';

export interface MemoizeOperatorOptions<Args extends readonly unknown[]> {
  readonly key?: (...args: Args) => string;
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
  cache: CacheHandleStore<MaybePromise<Result>>,
): ContextualMethod<This, Args, Result> {
  const key = options.key ?? ((...args: Args) => JSON.stringify(args));

  return function (
    this: This,
    context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): MaybePromise<Result> {
    const cacheKey = key(...args);
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      emitPolicyEvent(context, 'memoize', 'cache.hit', {});
      return cached.value;
    }

    emitPolicyEvent(context, 'memoize', 'cache.miss', {});
    const result = next.call(this, context, ...args);
    const replacement = cache.set(cacheKey, result, context);
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch((error: unknown) => {
        if (cache.deleteIfCurrent(cacheKey, replacement)) {
          emitPolicyEvent(replacement.context, 'memoize', 'cache.rejected', { error });
        }
      });
    }
    return result;
  };
}

function createMemoizeOperator<This, Args extends readonly unknown[], Result>(
  options: MemoizeOperatorOptions<Args>,
  createCache: () => CacheHandleStore<MaybePromise<Result>>,
): Operator<This, Args, Result, Result> {
  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'memoize',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const wrapper = createWrapper(
        function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        },
        options,
        createCache(),
      );
      return withoutContext(wrapper);
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next, options, createCache());
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
  options: MemoizeOperatorOptions<Args> = {},
): MemoizeWithHandle<This, Args, Result> {
  const cache = new CacheHandleStore<MaybePromise<Result>>('memoize');
  return Object.freeze({
    handle: cache.handle,
    operator: createMemoizeOperator(options, () => cache),
  });
}
