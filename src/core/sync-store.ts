import type { SyncStore } from './store';

export class MemorySyncStore<K, V> implements SyncStore<K, V> {
  #entries = new Map<K, V>();
  get(key: K): V | undefined {
    return this.#entries.get(key);
  }
  has(key: K): boolean {
    return this.#entries.has(key);
  }
  set(key: K, value: V): void {
    this.#entries.set(key, value);
  }
  delete(key: K): boolean {
    return this.#entries.delete(key);
  }
  clear(): void {
    this.#entries.clear();
  }
}
