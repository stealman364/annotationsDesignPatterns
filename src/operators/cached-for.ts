import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import { CacheHandleStore, type CacheHandle } from './cache-handle';

export interface CachedForOperatorOptions<Args extends readonly unknown[]> {
  readonly key?: (...args: Args) => string;
}

export interface CachedForWithHandle<This, Args extends readonly unknown[], Result> {
  readonly handle: CacheHandle;
  readonly operator: Operator<This, Args, Result, Result>;
}

interface CacheEntry<Result> {
  readonly value: MaybePromise<Result>;
  readonly expiresAt: number;
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
  ttlMs: number,
  options: CachedForOperatorOptions<Args>,
  cache: CacheHandleStore<CacheEntry<Result>>,
): ContextualMethod<This, Args, Result> {
  const key = options.key ?? ((...args: Args) => JSON.stringify(args));

  return function (
    this: This,
    context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): MaybePromise<Result> {
    const cacheKey = key(...args);
    const entry = cache.get(cacheKey);
    const now = Date.now();
    if (entry !== undefined && now < entry.value.expiresAt) {
      emitPolicyEvent(context, 'cachedFor', 'cache.hit', {});
      return entry.value.value;
    }
    if (entry !== undefined) {
      cache.deleteIfCurrent(cacheKey, entry);
    }

    emitPolicyEvent(context, 'cachedFor', 'cache.miss', {});
    const value = next.call(this, context, ...args);
    const replacement = cache.set(cacheKey, { value, expiresAt: now + ttlMs }, context);
    if (isPromiseLike(value)) {
      void Promise.resolve(value).catch((error: unknown) => {
        if (cache.deleteIfCurrent(cacheKey, replacement)) {
          emitPolicyEvent(replacement.context, 'cachedFor', 'cache.rejected', { error });
        }
      });
    }
    return value;
  };
}

function createCachedForOperator<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: CachedForOperatorOptions<Args>,
  createCache: () => CacheHandleStore<CacheEntry<Result>>,
): Operator<This, Args, Result, Result> {
  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'cachedFor',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const wrapper = createWrapper(
        function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        },
        ttlMs,
        options,
        createCache(),
      );
      return withoutContext(wrapper);
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next, ttlMs, options, createCache());
    },
  };

  return operator;
}

/** Creates a per-applied-method TTL cache, preserving legacy semantics. */
export function cachedFor<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: CachedForOperatorOptions<Args> = {},
): Operator<This, Args, Result, Result> {
  return createCachedForOperator(
    ttlMs,
    options,
    () => new CacheHandleStore<CacheEntry<Result>>('cachedFor'),
  );
}

/**
 * Creates an opt-in TTL cache with an explicit invalidation handle. The cache
 * is shared by applications of this returned operator only.
 */
export function cachedForWithHandle<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: CachedForOperatorOptions<Args> = {},
): CachedForWithHandle<This, Args, Result> {
  const cache = new CacheHandleStore<CacheEntry<Result>>('cachedFor');
  return Object.freeze({
    handle: cache.handle,
    operator: createCachedForOperator(ttlMs, options, () => cache),
  });
}
