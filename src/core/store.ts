export interface SyncStore<K, V> {
  get(key: K): V | undefined;
  has(key: K): boolean;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  clear(): void;
}

/**
 * Guarantees declared by a store adapter. A missing capability is never
 * inferred from the presence of a similarly named method.
 */
export interface StoreCapabilities {
  readonly atomic: boolean;
  readonly consistency: 'strong' | 'eventual' | 'unknown';
  readonly ttl: boolean;
  readonly isolation: 'instance' | 'process' | 'shared';
  readonly network: 'none' | 'optional' | 'required';
  readonly locks: boolean;
  readonly circuitBreaker: boolean;
}

export interface StoreEntryOptions {
  readonly ttlMs?: number;
}

export interface AsyncStore<K, V> {
  readonly capabilities?: StoreCapabilities;
  get(key: K): Promise<V | undefined>;
  has(key: K): Promise<boolean>;
  set(key: K, value: V, options?: StoreEntryOptions): Promise<void>;
  delete(key: K): Promise<boolean>;
  clear(): Promise<void>;
}

export type AsyncStoreUpdater<V> = (current: V | undefined) => V | Promise<V>;

/**
 * An async store with a verified per-key update primitive. Calling `get` and
 * then `set` on a plain AsyncStore is not an atomic compare-and-set operation.
 */
export interface AtomicAsyncStore<K, V> extends AsyncStore<K, V> {
  readonly capabilities: StoreCapabilities & { readonly atomic: true };
  update(key: K, updater: AsyncStoreUpdater<V>, options?: StoreEntryOptions): Promise<V>;
}

export type StoreCapability = 'atomic' | 'locks' | 'circuitBreaker';
export type StoreCapabilityPurpose = 'lock' | 'circuitBreaker';

export class StoreCapabilityError extends Error {
  readonly code = 'STORE_CAPABILITY' as const;

  constructor(
    readonly capability: StoreCapability,
    readonly purpose: StoreCapabilityPurpose,
  ) {
    super(`Store capability "${capability}" is required for ${purpose}`);
    this.name = 'StoreCapabilityError';
  }
}

type AtomicStoreCandidate<K, V> = AsyncStore<K, V> &
  Partial<Pick<AtomicAsyncStore<K, V>, 'update'>>;

export function isAtomicAsyncStore<K, V>(store: AsyncStore<K, V>): store is AtomicAsyncStore<K, V> {
  const candidate = store as AtomicStoreCandidate<K, V>;
  return candidate.capabilities?.atomic === true && typeof candidate.update === 'function';
}

/**
 * Rejects adapters before a lock or circuit breaker relies on atomic state.
 */
export function requireAtomicStore<K, V>(
  store: AsyncStore<K, V>,
  purpose: StoreCapabilityPurpose,
): asserts store is AtomicAsyncStore<K, V> {
  if (!isAtomicAsyncStore(store)) {
    throw new StoreCapabilityError('atomic', purpose);
  }

  const requiredCapability = purpose === 'lock' ? 'locks' : 'circuitBreaker';
  if (!store.capabilities[requiredCapability]) {
    throw new StoreCapabilityError(requiredCapability, purpose);
  }
}
