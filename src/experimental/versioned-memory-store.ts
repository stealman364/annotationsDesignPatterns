import { isDuration } from '../core/numeric';
import type {
  VersionedAsyncStore,
  VersionedCompareExchangeResult,
  VersionedStoreEntry,
} from './versioned-store';

interface MemoryEntry<Value> {
  readonly value: Value;
  readonly version: string;
  readonly expiresAt?: number;
}

let storeSequence = 0;

function createStoreId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  // The fallback namespaces this local reference store; it is collision-resistant,
  // but adapters requiring cross-process guarantees must supply their own versions.
  storeSequence += 1;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${storeSequence.toString(36)}`;
}

/**
 * Local reference implementation; its compare-and-set is synchronous and non-distributed.
 * Values are retained by reference, without cloning or deep freezing. Treat stored
 * values as immutable: external mutations do not advance their CAS version.
 */
export class VersionedMemoryStore<Value = unknown> implements VersionedAsyncStore<Value> {
  readonly capabilities = Object.freeze({ compareExchange: true, ttl: true } as const);

  readonly #storeId = createStoreId();
  readonly #entries = new Map<string, MemoryEntry<Value>>();
  #sequence = 0n;
  #epoch = 0n;

  async read(key: string): Promise<VersionedStoreEntry<Value>> {
    const entry = this.#liveEntry(key);
    if (entry !== undefined) return this.#presentSnapshot(entry);
    return this.#absentSnapshot();
  }

  async compareExchange(
    key: string,
    expectedVersion: string,
    value: Value,
    ttlMs?: number,
  ): Promise<VersionedCompareExchangeResult<Value>> {
    if (ttlMs !== undefined && !isDuration(ttlMs, true)) {
      throw new RangeError('VersionedMemoryStore ttlMs must be a finite, non-negative number');
    }

    const current = this.#liveEntry(key);
    const currentVersion = current?.version ?? this.#absentVersion();
    if (currentVersion !== expectedVersion) {
      return Object.freeze({
        exchanged: false,
        entry: current === undefined ? this.#absentSnapshot() : this.#presentSnapshot(current),
      });
    }

    this.#epoch += 1n;
    const entry: MemoryEntry<Value> = {
      value,
      version: this.#nextVersion(),
      ...(ttlMs === undefined ? {} : { expiresAt: Date.now() + ttlMs }),
    };
    this.#entries.set(key, entry);
    return Object.freeze({ exchanged: true, entry: this.#presentSnapshot(entry) });
  }

  async deleteIfVersion(key: string, expectedVersion: string): Promise<boolean> {
    const current = this.#liveEntry(key);
    if (current === undefined || current.version !== expectedVersion) return false;
    this.#entries.delete(key);
    this.#epoch += 1n;
    return true;
  }

  #liveEntry(key: string): MemoryEntry<Value> | undefined {
    const entry = this.#entries.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      this.#epoch += 1n;
      return undefined;
    }
    return entry;
  }

  #nextVersion(): string {
    this.#sequence += 1n;
    return `${this.#storeId}:v:${this.#sequence}`;
  }

  #absentVersion(): string {
    return `${this.#storeId}:a:${this.#epoch}`;
  }

  #absentSnapshot(): VersionedStoreEntry<Value> {
    return Object.freeze({ present: false as const, version: this.#absentVersion() });
  }

  #presentSnapshot(entry: MemoryEntry<Value>): VersionedStoreEntry<Value> {
    return Object.freeze({ present: true as const, value: entry.value, version: entry.version });
  }
}
