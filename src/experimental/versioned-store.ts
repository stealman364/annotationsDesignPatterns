/** Snapshot with readonly metadata; value ownership is defined by the provider. */
export type VersionedStoreEntry<Value> =
  | { readonly present: false; readonly version: string }
  | { readonly present: true; readonly version: string; readonly value: Value };

export interface VersionedCompareExchangeResult<Value> {
  readonly exchanged: boolean;
  readonly entry: VersionedStoreEntry<Value>;
}

/** Minimal async compare-and-set contract. Versions are opaque to callers. */
export interface VersionedAsyncStore<Value> {
  readonly capabilities: {
    readonly compareExchange: true;
    readonly ttl: true;
  };
  read(key: string): Promise<VersionedStoreEntry<Value>>;
  compareExchange(
    key: string,
    expectedVersion: string,
    value: Value,
    ttlMs?: number,
  ): Promise<VersionedCompareExchangeResult<Value>>;
  deleteIfVersion(key: string, expectedVersion: string): Promise<boolean>;
}
