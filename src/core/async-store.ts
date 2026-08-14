import type { AsyncStore } from './store';

export class MemoryAsyncStore<K, V> implements AsyncStore<K, V> {
  #entries = new Map<K, V>();
  async get(key: K): Promise<V | undefined> {
    return this.#entries.get(key);
  }
  async has(key: K): Promise<boolean> {
    return this.#entries.has(key);
  }
  async set(key: K, value: V): Promise<void> {
    this.#entries.set(key, value);
  }
  async delete(key: K): Promise<boolean> {
    return this.#entries.delete(key);
  }
  async clear(): Promise<void> {
    this.#entries.clear();
  }
}
