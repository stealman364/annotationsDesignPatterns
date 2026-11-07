/**
 * Experimental APIs are opt-in and may change independently of stable
 * entrypoints. Do not import them from the package root.
 */
export { hedge } from './hedge';
export type { HedgeOptions } from './hedge';
export { OverlapSupersededError, switchOverlap } from './switch-overlap';
export type { SwitchOverlapKeyContext, SwitchOverlapOptions } from './switch-overlap';
export { observeOperation } from './observe-operation';
export type {
  ObserveOperationOptions,
  OperationObservation,
  OperationOutcome,
} from './observe-operation';
export { asyncCachedFor, AsyncCacheError, isAsyncCacheError } from './async-cached-for';
export type {
  AsyncCachedForOptions,
  AsyncCacheCodec,
  AsyncCacheDiagnostic,
  AsyncCacheErrorPhase,
  AsyncCacheProvider,
} from './async-cached-for';
export { VersionedMemoryStore } from './versioned-memory-store';
export type {
  VersionedAsyncStore,
  VersionedStoreEntry,
  VersionedCompareExchangeResult,
} from './versioned-store';
