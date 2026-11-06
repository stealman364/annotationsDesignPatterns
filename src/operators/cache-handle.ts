import { emitPolicyEvent } from '../core/context';
import type { RuntimeOperationContext } from '../core/context';
import { isCount } from '../core/numeric';

type CacheEventContext =
  | Pick<
      RuntimeOperationContext<unknown, readonly unknown[]>,
      'eventSink' | 'metadata' | 'operationId'
    >
  | undefined;

/**
 * A cache can outlive the invocation which populated it. Keep only the
 * observation data needed when the entry is later invalidated; retaining the
 * full runtime context would also retain the receiver, arguments and signal.
 */
function projectEventContext(context: CacheEventContext): CacheEventContext {
  if (context === undefined) {
    return undefined;
  }

  return Object.freeze({
    eventSink: context.eventSink,
    metadata: context.metadata,
    operationId: context.operationId,
  });
}

export interface CacheHandle {
  /** Removes one logical cache key. Pending consumers keep their own result. */
  invalidate(key: string): void;
  /** Removes every logical cache key owned by this handle. */
  clear(): void;
}

export interface CacheHandleEntry<Value> {
  readonly context: CacheEventContext;
  readonly generation: number;
  readonly value: Value;
}

/**
 * Internal owner of cache state for the handle-enabled factories. Entry
 * identity prevents a stale pending promise from deleting a newer generation.
 */
export class CacheHandleStore<Value> {
  readonly handle: CacheHandle;

  #entries = new Map<string, CacheHandleEntry<Value>>();
  #nextGeneration = 0;

  constructor(
    private readonly operator: string,
    private readonly maxEntries?: number,
  ) {
    if (maxEntries !== undefined && !isCount(maxEntries, 1)) {
      throw new RangeError('cachedFor requires maxEntries to be a positive safe integer');
    }
    this.handle = Object.freeze({
      invalidate: (key: string): void => this.invalidate(key),
      clear: (): void => this.clear(),
    });
  }

  get(key: string): CacheHandleEntry<Value> | undefined {
    return this.#entries.get(key);
  }

  set(key: string, value: Value, context: CacheEventContext): CacheHandleEntry<Value> {
    this.#nextGeneration += 1;
    const entry = Object.freeze({
      context: projectEventContext(context),
      generation: this.#nextGeneration,
      value,
    });
    this.#entries.set(key, entry);
    // Enforce capacity before emitting user-observable events. Each insertion
    // can exceed the bound by at most one; a reentrant set enforces its own bound.
    if (this.maxEntries !== undefined && this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.entries().next().value;
      if (oldest !== undefined) {
        const [oldestKey, oldestEntry] = oldest;
        this.#entries.delete(oldestKey);
        emitPolicyEvent(oldestEntry.context, this.operator, 'cache.invalidated', {
          key: oldestKey,
        });
      }
    }
    return entry;
  }

  /** Bounded TTL caches clean up lazily; unconfigured caches retain legacy behavior. */
  pruneExpired(isExpired: (value: Value) => boolean): void {
    if (this.maxEntries === undefined) return;
    for (const [key, entry] of this.#entries) {
      if (isExpired(entry.value)) this.#entries.delete(key);
    }
  }

  deleteIfCurrent(key: string, entry: CacheHandleEntry<Value>): boolean {
    if (this.#entries.get(key) !== entry) {
      return false;
    }
    return this.#entries.delete(key);
  }

  invalidate(key: string): void {
    const entry = this.#entries.get(key);
    if (entry === undefined) {
      return;
    }
    this.#entries.delete(key);
    emitPolicyEvent(entry.context, this.operator, 'cache.invalidated', { key });
  }

  clear(): void {
    const entries = [...this.#entries];
    this.#entries.clear();
    for (const [key, entry] of entries) {
      emitPolicyEvent(entry.context, this.operator, 'cache.invalidated', { key });
    }
  }
}
