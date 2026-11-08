# Changelog

All notable changes to this project will be documented in this file. This
project follows Semantic Versioning.

## 2.3.0-rc.1

- Preserve the runtime reviewed in RC0. The RC0 npm publication stopped before
  publishing because lifecycle output preceded npm pack's JSON metadata.
- Tolerate that output in the release workflow and save canonical JSON metadata
  before validating the archive, integrity and source commit.
- Add regression checks that execute the actual artifact-validation step against
  a real tarball, with both clean and noisy output and a version mismatch.

## 2.3.0-rc.0

- Add functional rateLimit, bounded memoize and explicit executionMethod signal access.
- Add experimental opt-in shared cancellation and external async cache/CAS contracts.
- Add optimistic StateMachine transitions, observability adapters and diagnostic handles.
- Serialize AsyncMemoryStore mutations per key and make clear/cleanup mutation barriers.
  Reads keep returning the latest committed value without waiting. Updaters must
  return the new value rather than await same-key writes or clear/cleanup.
- Preserve existing default sync behavior and public closed policy unions; no runtime dependencies.
- Remove the local self-dependency (absent from the published 2.2.0 package).
- Add packed ESM/CJS and TypeScript 5.0/current consumer checks.
- Add Spanish/English 2.3 migration guides. Document the measured memoize consumer
  increase (1,664 to 2,800 gzip bytes) and review only affected size budgets.
- Isolate accidentally asynchronous failures from directly configured EventSink
  callbacks as well as adapters. Classify failing provider-envelope accessors as
  AsyncCacheError with schema phase and preserve the original cause.

See V2.3-RUNTIME.md for contracts, migration limits and experimental status.
The older RC notes below are retained as historical working notes.

## 2.2.0-rc.0 (unreleased)

### Opt-in capabilities

- Add functional `semaphore({ permits, key?, maxQueue? })` and
  `SemaphoreQueueFullError` to `/operators`. One applied pipeline shares its
  default pool across receivers; optional keys partition pools and `run().key`
  takes precedence. FIFO, direct permit transfer, queued abort withdrawal and
  active ownership until inner settlement reuse the existing PermitQueue.
  Calls always return a Promise while admitted work starts synchronously.
- Migrate `@Semaphore` through the instance-scoped decorator adapter to that
  same operator. Preserve per-instance pools, Promise failures and eager start.
  Existing semaphore event kinds remain unchanged; queue overflow uses the
  existing generic `POLICY_ERROR` code rather than extending PolicyErrorCode.
- Add `perReceiver: true` to functional memoize and cachedFor without handles.
  Object and function identities get separate weak partitions. Invalid
  receivers produce a clear TypeError; default pipeline-wide caches are unchanged.
  WithHandle factories omit this option from their signatures and reject attempts
  to enable it at runtime. CacheHandle still exposes only invalidate and clear.
- Add positive-safe-integer `maxEntries` to cachedFor and cachedForWithHandle.
  FIFO insertion-order eviction includes pending entries and does not reorder
  hits. Bounded caches prune expired entries silently on misses; eviction emits
  existing `cache.invalidated`. No timers, background sweeper or LRU are added.
  Pending consumers keep their result after eviction and stale rejections cannot
  delete replacement entries. Capacity applies per receiver partition or handle.
- Snapshot the new cache flags/capacity at factory creation so later option
  mutation cannot bypass validation or disconnect a handle from its cache.
  Preserve the legacy capture timing of custom key functions at operator apply.

### Resilience decisions

- Add synchronous CircuitBreaker `isFailure(error, info)` through functional,
  decorator and definePolicy APIs. Readonly invocation info contains receiver,
  args, key, operationId and metadata, without execution controls or sinks.
  False ignores an error without counting it as success or resetting history.
  HALF_OPEN ignored errors release the current probe without closing the circuit.
  Caller cancellation and stale generations bypass classification; a throwing
  predicate rejects with its decision error without counting the original error.
- Retry gains optional `maxDelayMs` and `jitter: 'none' | 'full' | 'equal'`.
  Exponential delay is capped by both the portable timer limit and the optional
  user limit before jitter. Default jitter remains none; zero waits use the
  cancellable microtask path. definePolicy descriptions include new fields only
  when explicitly configured.
- Prioritize cancellation triggered inside `shouldRetry`, including callbacks
  that return false or throw. Preserve the caller's exact reason and avoid
  emitting `retry.exhausted` for that cancellation.

### Types, diagnostics and engineering

- Observer event maps now accept named interfaces while retaining checked event
  names/payloads, thenable returns and the default unknown-payload escape hatch.
  StateMachine closed-union checks remain unchanged.
- Instance-scoped decorators reject unbound calls or primitive receivers,
  including symbols, with explicit object-receiver diagnostics. Valid object and
  function receivers retain their behavior and existing error delivery channel.
- Document the existing JSON cache-key collisions and special inputs, with
  custom string-key resolvers as the escape hatch. The default key strategy,
  receiver scope, invocation-relative TTL and Infinity semantics are unchanged.
- Add repository-only span-event and counter recipes using injected callbacks,
  plus reproducible ten-path runtime benchmarks with warmup, multiple samples
  and an optional same-environment comparison. No vendor SDK enters the library.
- Correct observability guides against actual exports, `PolicyEvent.kind`,
  numeric epoch timestamps, error metadata and LoggerEventSink construction.

### Compatibility and deferred designs

Existing defaults and public event unions are preserved. New APIs/options are
opt-in; invalid new flags and capacities fail early. Consumers compiling custom
option types should review the WithHandle restriction and generic callback info.
This RC retains zero runtime dependencies, ESM/CJS, standard TC39 decorators,
existing subpaths and tree-shaking. It is prepared locally and not published.

Shared-work reference-count cancellation, functional rate limiting, async
StateMachine transition policies, distributed stores/locks, vendor adapters and
new testing registries remain design-only or deferred. See `POST-2.1-RFCS.md` in
the repository and the [2.2 migration guide](./website/docs/migration/2.2.md).

## 2.1.0-rc.0 (unreleased)

### Correctness and cancellation

- A caller aborted through `run(..., { signal })` rejects with the exact
  `signal.reason`, including non-Error values. Cancellation stops that caller
  waiting; non-cooperative work may continue.
- Caller cancellation no longer invokes fallback, increments or resets circuit
  breaker failures, or becomes a cached cancellation result. Ordinary business
  errors, unrelated `AbortError`s, and internal timeouts retain their normal
  policy behavior.
- `memoize`, `cachedFor`, and `overlap({ mode: 'share' })` isolate each caller's
  signal from shared execution. Cancelling the initiating caller does not cancel
  other consumers. Successful shared results can still populate caches.
- Timeout propagates its internal execution signal to contextual inner
  operators even without `run()`, without consuming public operation IDs.
- Contextual outer operators, identity operators and nested pipelines preserve
  invocation context. An ordinary opaque custom wrapper remains a context
  boundary for the operators inside it.
- Global timeout policies composed with retry no longer require a static
  `abortSignal`; an explicitly supplied signal remains supported.

### Concurrency and async behavior

- Aborted `overlap(queue)` waiters withdraw, free `maxQueue` capacity, reject
  with their reason, and never execute. Admission remains FIFO with direct
  permit transfer and a second abort check before execution.
- Active queue holders retain permits until their inner execution settles;
  caller cancellation cannot physically stop non-cooperative work.
- `@Semaphore` strictly respects its concurrency limit during handoff and
  reentrant arrivals. Existing keyedLock behavior and public event names remain
  covered by characterization tests.
- HALF_OPEN circuit probes have a lease of `resetMs`. A later call may replace
  a hung probe after the lease expires. Generation checks prevent obsolete
  success, failure, or cancellation from changing the current circuit or
  freeing a newer probe's position. Existing probe callers keep their own result.
- `@Revertible` records async operations only after success, including thenables,
  in completion order. Rejections are not recorded. `undoLast()` retains the
  history entry if synchronous undo throws; the `Command` interface and
  synchronous undo contract remain unchanged.
- `Subject.emit()` iterates the listeners present at the start of each emission
  in subscription order. Changes to subscriptions affect subsequent emissions;
  reentrant emissions take their own snapshot.
- `builderFor().withURL()` writes `URL`, and `withHTTPPort()` writes `HTTPPort`.
  Suffixes starting with two ASCII uppercase letters retain their spelling;
  other suffixes lowercase their first character. Ambiguous `uRL`/`URL` names
  both map to `withURL`, which chooses `URL` without constructor introspection.

### Numeric validation

- Timer delays reject NaN, infinities, negatives, and values greater than
  `2_147_483_647` before execution. Functional timeout, retry delay, hedge delay,
  and remote-store timeout accept zero; `@Timeout`, policy timeout and
  `@Debounce` require positive values. Fractional valid delays remain supported.
- Retry attempts, breaker failures, semaphore permits, and rate-limit counts
  require positive safe integers. Explicit queue limits require non-negative
  safe integers. Retry's computed backoff is clamped to the portable timer limit.
- TTL validation is separate: functional cachedFor and AsyncMemoryStore accept
  zero and Infinity; `@CachedFor` requires a positive TTL and accepts Infinity.
  Elapsed-time windows for Throttle, RateLimit and breaker reset are finite and
  positive, without imposing a timer upper bound.
- Existing error classes and policy error paths remain intact. Invalid values
  previously accepted silently now fail early. `AsyncMemoryStore` additionally
  accepts Infinity for a non-expiring entry.

### Types and compatibility

- `@On` and `@Emits` check event names and payloads against a declared Subject
  event map. `@When` and `@TransitionTo` check names against a declared closed
  state union. Generic Subject event names and `StateMachine<string>` remain
  available; an untyped Subject's payload remains `unknown`.
- These declaration changes can reveal previously accepted mistakes at compile
  time; review consumers before upgrading. StateMachine async operations remain
  unserialized: stronger state types do not eliminate concurrent transition races.
- Default cache keys, per-receiver decorator caches, shared functional pipeline
  caches, and TTL measured from invocation remain unchanged. No reference-counted
  cancellation of shared execution, optional retry features, or new public
  PolicyEvent kinds are introduced. Runtime dependencies remain empty.
- `audit:any` now enforces reviewed per-file debt budgets for source and both
  declaration formats, accepting reductions while rejecting increases.
- CI checks reproducible raw/gzip footprints for 96 ESM/CJS entrypoints.
  Global coverage budgets are tighter, with percentage thresholds on critical
  cancellation, queue, breaker, overlap and policy-validation files.

See the [2.1 migration guide](./website/docs/migration/2.1.md) for contracts,
numeric limits, and behavior changes. This RC is prepared locally; it has not
been published. See `V2.1-BASELINE.md` for execution evidence and remaining
release-review limitations.

## 2.0.0

### Major Changes

- 595616c: Release 2.0 changes async state transitions, constructor inheritance isolation, and DI cycle errors. See the [migration guide to 2.0](https://stealman364.github.io/annotationsDesignPatterns/docs/migration/2.0/) for details.

### Minor Changes

- Add a decorator-free functional API. `/operators` exposes `retry`, `timeout`,
  `fallback`, `circuitBreaker`, `memoize` and `cachedFor`, sharing the same engine
  as their decorators; `/pipe` composes them over any function and `/run` invokes
  a pipeline preserving its receiver and arguments. `/policy` adds `definePolicy`
  and `/decorators` is a stable facade for the resilience decorators.

- 595616c: `Retry` now rejects non-finite or out-of-range numeric options when the decorator is created, instead of silently accepting configurations that cannot retry reliably.

  `Emits`, `Log`, and `Measure` now treat custom thenables like native Promises, including their rejection paths.

  `Memoize` and `CachedFor` evict rejected asynchronous entries; `CircuitBreaker` validates numeric options and permits one local half-open probe.

- 595616c: Add stable functional policy, observability, concurrency, cache-handle, async
  store, and opt-in Node context subpaths. `overlap`, `keyedLock`,
  `memoizeWithHandle`, and `cachedForWithHandle` are available from
  `/operators`; `/store` and `/node` have explicit ESM, CJS, and type exports.

### Patch Changes

- a139274: Add a bilingual (ES/EN) documentation site (`/website`, not published to npm) combining API reference generated from `src/**` via TypeDoc with hand-maintained guides for all 10 public entrypoints. No runtime code changed — comments/JSDoc only, verified against the existing public export surface.

## 1.1.0

### Minor Changes

- Async observer improvements.
- Local development standards with Lefthook and Commitlint.
- GitHub templates for pull requests, bug reports, and feature requests.
- Release, changelog, API stability, and security documentation.

## 1.0.0 - 2026-07-03

### Added

- Initial release of `annotations-design-patterns`.
- TC39 TypeScript decorators for creational, structural, behavioral, and utility patterns.
- Dual ESM/CJS build with type declarations and granular package exports.
- Unit, composition, type, and distribution smoke tests.
