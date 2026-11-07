import { isTtl } from '../core/numeric';
import type {
  AtomicAsyncStore,
  AsyncStoreUpdater,
  StoreCapabilities,
  StoreEntryOptions,
} from '../core/store';

interface MemoryEntry<V> {
  readonly value: V;
  readonly expiresAt?: number;
}

const memoryStoreCapabilities = Object.freeze({
  atomic: true,
  consistency: 'strong',
  ttl: true,
  isolation: 'instance',
  network: 'none',
  locks: true,
  circuitBreaker: true,
} as const satisfies StoreCapabilities);

/**
 * In-process async store. Mutations on a key serialize in admission order;
 * reads see the latest committed value without waiting for pending mutations.
 * Clear and cleanup form barriers across all keys. An updater must not await
 * another mutation on its own key, clear(), or cleanup(), because those
 * operations wait for the updater to finish. Reentrancy detection is not provided.
 */
export class AsyncMemoryStore<K, V> implements AtomicAsyncStore<K, V> {
  readonly capabilities = memoryStoreCapabilities;

  #entries = new Map<K, MemoryEntry<V>>();
  #keyTails = new Map<K, Promise<void>>();
  #barrier: Promise<void> = Promise.resolve();

  async get(key: K): Promise<V | undefined> {
    return this.#getEntry(key)?.value;
  }

  async has(key: K): Promise<boolean> {
    return this.#getEntry(key) !== undefined;
  }

  set(key: K, value: V, options: StoreEntryOptions = {}): Promise<void> {
    return this.#runExclusive(key, () => {
      this.#entries.set(key, this.#createEntry(value, options));
    });
  }

  delete(key: K): Promise<boolean> {
    return this.#runExclusive(key, () => {
      if (this.#getEntry(key) === undefined) return false;
      return this.#entries.delete(key);
    });
  }

  clear(): Promise<void> {
    return this.#runBarrier(() => this.#entries.clear());
  }

  cleanup(): Promise<void> {
    return this.#runBarrier(() => {
      const now = Date.now();
      for (const [key, entry] of this.#entries) {
        if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
          this.#entries.delete(key);
        }
      }
    });
  }

  update(key: K, updater: AsyncStoreUpdater<V>, options: StoreEntryOptions = {}): Promise<V> {
    return this.#runExclusive(key, async () => {
      const value = await updater(this.#getEntry(key)?.value);
      this.#entries.set(key, this.#createEntry(value, options));
      return value;
    });
  }

  #getEntry(key: K): MemoryEntry<V> | undefined {
    const entry = this.#entries.get(key);

    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }

    return entry;
  }

  #createEntry(value: V, options: StoreEntryOptions): MemoryEntry<V> {
    const { ttlMs } = options;

    if (ttlMs === undefined) {
      return { value };
    }

    if (!isTtl(ttlMs, true)) {
      throw new RangeError('ttlMs must be a finite, non-negative number');
    }

    // Entry expiration begins when the queued write commits, not when admitted.
    return { value, expiresAt: Date.now() + ttlMs };
  }

  #runExclusive<Result>(key: K, work: () => Result | Promise<Result>): Promise<Result> {
    const predecessor = this.#keyTails.get(key) ?? Promise.resolve();
    const barrier = this.#barrier;
    const execution = predecessor.then(() => barrier).then(work);
    const tail = execution.then(
      () => undefined,
      () => undefined,
    );
    this.#keyTails.set(key, tail);

    return execution.finally(() => {
      if (this.#keyTails.get(key) === tail) {
        this.#keyTails.delete(key);
      }
    });
  }

  #runBarrier(work: () => void): Promise<void> {
    const previousBarrier = this.#barrier;
    const admittedTails = [...this.#keyTails.values()];
    let releaseBarrier: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    this.#barrier = barrier;

    return (async () => {
      try {
        await previousBarrier;
        await Promise.all(admittedTails);
        work();
      } finally {
        // A failed global operation must not strand work admitted after it.
        releaseBarrier();
      }
    })();
  }
}
