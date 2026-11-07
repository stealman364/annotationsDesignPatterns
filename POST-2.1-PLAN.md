# Post-2.1 execution and API decisions

Baseline: locally implemented 2.1.0-rc.0, 715 tests, typecheck/lint/format,
coverage, installed package, publint, attw, package verification and size gates
passing. Prior hardening is preserved, not reimplemented. Its working tree was
not committed; a source/dist snapshot is retained at
`%TEMP%/annotations-post21-baseline/` for comparisons.

Target: additive 2.2.0-rc.0, local preparation only. The orchestrator owns API,
integration and compatibility decisions; subagents implement bounded tasks.

## Wave A

- Functional `semaphore({ permits, key?, maxQueue? })` from `/operators`.
  `key` receives the same readonly invocation-key context as keyedLock/overlap;
  a run context key overrides it. Without keys one applied pipeline owns one
  pool shared across receivers. Permits are positive safe integers, explicit
  maxQueue is a nonnegative safe integer, omitted queue is unbounded.
  Always returns a Promise, but admitted work starts synchronously, matching
  the existing async decorator. Caller cancellation withdraws waiters and
  stops the caller waiting; active ownership lasts until inner settlement.
  Existing semaphore queued/acquired/released events are reused, with no new
  PolicyEvent variants. Queue overflow uses new SemaphoreQueueFullError with
  existing generic POLICY_ERROR code, avoiding expansion of PolicyErrorCode.
  @Semaphore remains per instance, Promise-returning, using adapter -> operator
  -> PermitQueue. Preserve synchronous start and rejection of sync target throws.
- `memoize({ perReceiver: true })` and
  `cachedFor(ttl, { perReceiver: true, maxEntries? })` partition state by object
  or function identity using WeakMap. Invalid receivers throw clear TypeError.
  Default pipeline cache scope and key resolver are unchanged.
- WithHandle factories accept capacity/key options but not perReceiver.
  Existing exported options remain usable; WithHandle omits the perReceiver
  property in its signature and rejects runtime attempts to enable it. No size
  property is invented for CacheHandle, which currently has invalidate/clear.
- `cachedFor` maxEntries is an optional positive safe integer, not Infinity.
  Pending entries count. Hits do not reorder. The oldest insertion is evicted;
  pending consumers are not cancelled and late rejection cannot remove a new
  entry. Bounded caches lazily prune expired entries on misses, without timers.
  Unconfigured caches retain existing behavior and invocation-relative TTL.
  Capacity eviction uses existing cache.invalidated events; expiry stays silent.
- Cache keys remain JSON.stringify(args). Audit collisions and exceptional
  inputs; document custom key functions instead of changing identity defaults
  or inventing a universal serializer.
- Add one internal object/function receiver assertion for instance-scoped
  decorators, preserving valid receivers and existing async/sync error channels.

## Wave B

- `circuitBreaker` options gain generic `isFailure(error, info): boolean`.
  Info is readonly receiver/args/key/operationId/metadata, with no mutable runtime
  context or sink. Caller cancellation and stale generations bypass predicates.
  False means ignored: no increment, no reset, no close. Current HALF_OPEN
  probe ownership is released; OPEN history is preserved. Predicate throw
  rejects with the decision error, as retry.shouldRetry does, without counting
  the original error. Cancellation takes precedence if it happens in a predicate.
  Integrate options through decorators and definePolicy, with no new event kind.
- Retry adds optional maxDelayMs (finite 0..2147483647) and jitter
  none/full/equal, default none. Raw exponential delay -> technical/user cap ->
  jitter. No public random source. A zero resulting delay uses the existing
  cancellable microtask retry path. New describe fields appear only if supplied.
- Observer already validates events/payloads. Relax the index-signature
  constraint so a named interface EventMap works; retain positive/negative
  type tests, default unknown payloads and runtime behavior. StateMachine
  closed-state typing is already complete and remains unchanged.

## Design-only decisions

Refcount cancellation is deferred: cancelling/evicting the last consumer,
reentrant joins and cache handles need an explicit execution lifecycle; the
current isolated-caller model remains correct. Draft its lifecycle contract.

RateLimit, async StateMachine versioning and store-backed resilience receive
design spikes/RFCs only. No waiting rate limiter, distributed lock, vendor SDK,
global registry, new reset-all API or automatic adapter is implemented.

Keep EventSink and logger; provide dependency-free external adapter recipes and
correct outdated observability documentation against actual exports/events.
Evaluate testing handles without introducing registries or weak-map enumeration.

## Verification and delivery

Each implementation starts with tests, observed failing expectations, focused
checks and review. Wave gates include full tests/coverage, typecheck, lint,
build, dist/installed consumers, publint/attw and package verification.
Compare public declarations and export deltas against the retained 2.1 snapshot.
Size budget increases must be measured and reviewed, never silently rebased.
Add reproducible warmup/multiple-sample benchmarks for the requested paths.
Final report lists implemented/rejected/deferred items, APIs, contracts,
SemVer, tests, size deltas, architecture and remaining debt.

## RC closure checklist (2026-11-06)

Execute inline in the existing working tree to preserve the uncommitted 2.1
baseline and 2.2 implementation together.

- [x] Align package.json and package-lock.json to 2.2.0-rc.0 using
  `npm version 2.2.0-rc.0 --no-git-tag-version --ignore-scripts`.
- [x] Run format:check, lint, typecheck and test:coverage; resolve failures
  without weakening thresholds or silently resetting size budgets.
- [x] Build once, then run the underlying audit, size, dist smoke, publint,
  attw, package verification and installed-consumer commands sequentially.
- [x] Run the bilingual website build, typecheck and check:i18n.
- [x] Review public exports/declarations, entrypoint footprints and benchmarks.
  The retained 2.1 snapshot is empty in this session; use recovered 2.0 commit
  91f1142 and disclose that substitution rather than inventing a 2.1 comparison.
- [x] Write V2.2-CLOSURE.md with results, API/SemVer decisions and remaining
  external release checks. Commit the prepared RC without publishing or tagging.

Local closure results and portable evidence: [V2.2-CLOSURE.md](V2.2-CLOSURE.md)
and `release/2.2.0-rc.0/`. Future RFC proposals remain deferred as intended.
