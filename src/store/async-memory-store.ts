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
 * In-process async store with lazy TTL eviction and serialized updates per key.
 */
export class AsyncMemoryStore<K, V> implements AtomicAsyncStore<K, V> {
  readonly capabilities = memoryStoreCapabilities;

  #entries = new Map<K, MemoryEntry<V>>();
  #updateTails = new Map<K, Promise<void>>();

  async get(key: K): Promise<V | undefined> {
    return this.#getEntry(key)?.value;
  }

  async has(key: K): Promise<boolean> {
    return this.#getEntry(key) !== undefined;
  }

  async set(key: K, value: V, options: StoreEntryOptions = {}): Promise<void> {
    this.#entries.set(key, this.#createEntry(value, options));
  }

  async delete(key: K): Promise<boolean> {
    if (this.#getEntry(key) === undefined) {
      return false;
    }

    return this.#entries.delete(key);
  }

  async clear(): Promise<void> {
    this.#entries.clear();
  }

  async cleanup(): Promise<void> {
    const now = Date.now();

    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
        this.#entries.delete(key);
      }
    }
  }

  async update(key: K, updater: AsyncStoreUpdater<V>, options: StoreEntryOptions = {}): Promise<V> {
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

    if (!Number.isFinite(ttlMs) || ttlMs < 0) {
      throw new RangeError('ttlMs must be a finite, non-negative number');
    }

    return { value, expiresAt: Date.now() + ttlMs };
  }

  async #runExclusive<Result>(key: K, work: () => Promise<Result>): Promise<Result> {
    const predecessor = this.#updateTails.get(key) ?? Promise.resolve();
    let releaseGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const tail = predecessor.catch(() => undefined).then(() => gate);

    this.#updateTails.set(key, tail);
    await predecessor.catch(() => undefined);

    try {
      return await work();
    } finally {
      releaseGate();

      if (this.#updateTails.get(key) === tail) {
        this.#updateTails.delete(key);
      }
    }
  }
}
