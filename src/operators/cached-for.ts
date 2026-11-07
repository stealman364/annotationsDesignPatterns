import { isCount, isTtl } from '../core/numeric';
import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { raceWithSignal, sharedContext } from '../core/cancellation';
import { assertObjectReceiver } from '../core/receiver';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import { CacheHandleStore, type CacheHandle } from './cache-handle';
import { startSharedCache, type SharedCacheValue } from './shared-cache';

export interface CachedForOperatorOptions<Args extends readonly unknown[]> {
  readonly key?: (...args: Args) => string;
  /** Isolate entries by object/function receiver identity. Opt-in, without handles. */
  readonly perReceiver?: boolean;
  /** Maximum retained entries, including pending results. FIFO; hits do not reorder. */
  readonly maxEntries?: number;
  /** @experimental Cooperatively abort shared work when its last consumer withdraws. */
  readonly cancelWhenUnused?: boolean;
}

export interface CachedForWithHandle<This, Args extends readonly unknown[], Result> {
  readonly handle: CacheHandle;
  readonly operator: Operator<This, Args, Result, Result>;
}

interface CacheEntry<Result> extends SharedCacheValue<Result> {
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
  sharedCache: CacheHandleStore<CacheEntry<Result>>,
): ContextualMethod<This, Args, Result> {
  const key = options.key ?? ((...args: Args) => JSON.stringify(args));
  const maxEntries = options.maxEntries;
  const receiverCaches =
    options.perReceiver === true
      ? new WeakMap<object, CacheHandleStore<CacheEntry<Result>>>()
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
      assertObjectReceiver(this, 'cachedFor perReceiver');
      let receiverCache = receiverCaches.get(this);
      if (receiverCache === undefined) {
        receiverCache = new CacheHandleStore<CacheEntry<Result>>('cachedFor', maxEntries);
        receiverCaches.set(this, receiverCache);
      }
      cache = receiverCache;
    }
    const cacheKey = key(...args);
    const entry = cache.get(cacheKey);
    const now = Date.now();
    if (entry !== undefined && now < entry.value.expiresAt) {
      if (options.cancelWhenUnused === true) {
        const result = entry.value.execution?.join(context?.signal) ?? entry.value.value;
        emitPolicyEvent(context, 'cachedFor', 'cache.hit', {});
        return raceWithSignal(result, context?.signal);
      }
      emitPolicyEvent(context, 'cachedFor', 'cache.hit', {});
      return raceWithSignal(entry.value.value, context?.signal);
    }
    if (entry !== undefined) {
      cache.deleteIfCurrent(cacheKey, entry);
    }
    cache.pruneExpired((value) => now >= value.expiresAt);

    if (options.cancelWhenUnused === true) {
      if (context?.signal?.aborted === true) return Promise.reject(context.signal.reason);
      return startSharedCache(cache, cacheKey, 'cachedFor', next, this, args, context, (value) => ({
        value,
        expiresAt: now + ttlMs,
      }));
    }

    emitPolicyEvent(context, 'cachedFor', 'cache.miss', {});
    if (context?.signal !== undefined && Boolean(context.signal.aborted))
      return Promise.reject(context.signal.reason);
    const value = next.call(this, sharedContext(context), ...args);
    const replacement = cache.set(cacheKey, { value, expiresAt: now + ttlMs }, context);
    if (isPromiseLike(value)) {
      void Promise.resolve(value).catch((error: unknown) => {
        if (cache.deleteIfCurrent(cacheKey, replacement)) {
          emitPolicyEvent(replacement.context, 'cachedFor', 'cache.rejected', { error });
        }
      });
    }
    return raceWithSignal(value, context?.signal);
  };
}

function createCachedForOperator<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: CachedForOperatorOptions<Args>,
  createCache: (maxEntries: number | undefined) => CacheHandleStore<CacheEntry<Result>>,
  withHandle = false,
): Operator<This, Args, Result, Result> {
  const perReceiver = options.perReceiver;
  const maxEntries = options.maxEntries;
  const cancelWhenUnused = options.cancelWhenUnused;
  if (cancelWhenUnused !== undefined && typeof cancelWhenUnused !== 'boolean') {
    throw new TypeError('cachedFor requires cancelWhenUnused to be a boolean');
  }
  if (perReceiver !== undefined && typeof perReceiver !== 'boolean') {
    throw new TypeError('cachedFor requires perReceiver to be a boolean');
  }
  if (withHandle && perReceiver === true) {
    throw new TypeError('cachedForWithHandle does not support perReceiver');
  }
  if (!isTtl(ttlMs, true)) {
    throw new RangeError('cachedFor requires a non-negative TTL');
  }
  if (maxEntries !== undefined && !isCount(maxEntries, 1)) {
    throw new RangeError('cachedFor requires maxEntries to be a positive safe integer');
  }
  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'cachedFor',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const wrapper = createWrapper(
        function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        },
        ttlMs,
        { key: options.key, perReceiver, maxEntries, cancelWhenUnused },
        createCache(maxEntries),
      );
      return withoutContext(wrapper);
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(
        next,
        ttlMs,
        { key: options.key, perReceiver, maxEntries, cancelWhenUnused },
        createCache(maxEntries),
      );
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
    (maxEntries) => new CacheHandleStore<CacheEntry<Result>>('cachedFor', maxEntries),
  );
}

/**
 * Creates an opt-in TTL cache with an explicit invalidation handle. The cache
 * is shared by applications of this returned operator only.
 */
export function cachedForWithHandle<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: Omit<CachedForOperatorOptions<Args>, 'perReceiver'> = {},
): CachedForWithHandle<This, Args, Result> {
  const receiverOptions: CachedForOperatorOptions<Args> = options;
  const maxEntries = options.maxEntries;
  const configuration: CachedForOperatorOptions<Args> = {
    get key() {
      return options.key;
    },
    perReceiver: receiverOptions.perReceiver,
    maxEntries,
    cancelWhenUnused: options.cancelWhenUnused,
  };
  const cache = new CacheHandleStore<CacheEntry<Result>>('cachedFor', maxEntries);
  return Object.freeze({
    handle: cache.handle,
    operator: createCachedForOperator(ttlMs, configuration, () => cache, true),
  });
}
