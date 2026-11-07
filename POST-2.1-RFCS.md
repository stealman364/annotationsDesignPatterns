# Post-2.1 design decisions and deferred proposals

Date: 2026-10-28. These proposals build on the existing 2.1 correctness work.
They introduce no runtime code, public exports, dependencies, or automatic
integrations. The recommendations below are for orchestrator review; proposed
names and signatures are not released APIs.

## Shared execution cancellation when every consumer abandons

**Recommendation: defer this feature.** Preserve the current contract: each
consumer races its own signal; cancelling one consumer does not cancel shared
execution or another consumer. An underlying operation may continue after every
current consumer cancels. Changing that default could suppress existing side
effects and would be an observable behavior change.

If implemented later, make this behavior explicitly opt-in. Do not add an option
until one common internal execution owner works for memoize, cachedFor and
overlap share. A controller added only to the first consumer is insufficient.

The required lifecycle is:

| State | Admission and completion rules |
| --- | --- |
| Accepting | Own one shared AbortController and the execution promise. Each consumer has its own membership, optional signal, and settled flag. Reserve the entry before calling user code so reentrant consumers join the same execution. |
| Settled | Record settlement once; detach all consumer listeners. A successful cache result may remain according to existing cache/TTL rules. Cancellation accounting stops. |
| Retired | Reject new joins to this execution. Remove the current lookup entry by identity before dispatching controller.abort(), because abort listeners can reenter the pipeline. |
| Retired but running | Work ignoring the signal can finish later. Its settlement cannot remove a replacement entry, publish a replacement cache value, or change the new execution's ownership. Observe late rejection. |

Consumers without a signal remain active until execution settles. Each member
can withdraw at most once; a pre-aborted caller never becomes an active member.
If the last active member withdraws before settlement, retire the execution and
then abort its controller. A new caller must start or join a replacement rather
than inherit an already aborted signal.

The library must not equate removing a cache lookup with cancelling execution.
Existing handle invalidation promises that pending consumers keep their own
result. `invalidate(key)` and `clear()` therefore retire lookup visibility only;
they do not withdraw consumers. A TTL expiry or future capacity eviction needs
the same separation. Refcount membership must not keep receivers alive after
settlement.

Before implementation, tests must control both orders of every race: last
withdrawal versus resolution/rejection; new join versus retirement; reentrant
join during abort; invalidation versus settlement; and old execution settlement
after a replacement is installed. The shared abort reason also needs a defined
contract independent of whichever consumer happened to leave last. These
requirements justify deferring the optimization instead of adding partial
refcount support.

## Functional rate limiting

**Recommendation: keep this as a design spike in this phase.** If advanced to
implementation, the first contract should be a sliding-window admission limit
with immediate rejection, no waiting and no background timers. The existing
`@RateLimit` drops excess calls and has a void-oriented contract; a functional
operator returning typed results must not copy that behavior or silently change
the decorator.

The nine design questions are closed as follows for the proposed first version:

| Question | Proposed answer |
| --- | --- |
| Algorithm | Sliding log of admitted invocation timestamps. On admission remove entries whose age is at least windowMs, then compare retained count with limit. Keep admission updates synchronous. |
| Excess calls | Return a rejected promise with a proposed `RateLimitExceededError`; do not invoke the protected method. An optional readonly retryAfterMs value is calculated from the oldest retained admission and is advisory. The error name and code require a separate public API review. |
| Global or keyed | State belongs to one applied pipeline, shared across its receivers. No keys in the first version; keyed cardinality and cleanup require their own bounded-state design. |
| Queue | None. There is no relationship to PermitQueue ownership or FIFO scheduling. |
| Waiting | None. No sleep, queue limit, retry loop or admission timer. |
| AbortSignal | A pre-aborted caller rejects with its reason before consuming an admission. Once user work has started, cancellation ends that caller's wait but does not refund admission or promise physical cancellation. |
| Result | An admitted call preserves the protected method's value and sync/async behavior. An excess call rejects; it must not manufacture undefined as a successful Result. A failed invocation still consumed admission. |
| Retry composition | A retry layer outside the limiter attempts admission again. It may repeatedly receive limit rejection. The consumer must exclude that error in shouldRetry or intentionally schedule retries; the limiter does not implement waiting. A limiter outside retry admits one overall invocation whose inner attempts may exceed one backend call. |
| CircuitBreaker composition | Default breaker accounting includes ordinary non-cancellation errors, so a limiter inside a breaker can count a limit rejection unless configured otherwise. Put admission outside the breaker to avoid that, or explicitly classify the rejection through isFailure if that feature is available. No hidden special-case classification. |

Numeric configuration must use the existing safe positive count and finite
positive elapsed-duration domains. There is no timer-range cap on windowMs
because the algorithm schedules no timer. Boundary tests should use a controlled
clock and verify exact expiry, a full burst, failed admitted operations, caller
cancellation, and both composition orders. Clock-regression semantics must be
documented before stabilization; this spike does not replace the library's
clock globally.

Do not add a mode enum with only one supported behavior. Do not implement wait,
token buckets, distributed limiting, or decorator migration as part of this
proposal. Adding an error or PolicyEvent kind needs orchestrator review,
including consumers with exhaustive switches.

## StateMachine asynchronous transitions

**Recommendation: preserve current runtime behavior and defer an opt-in
concurrency contract.** The existing type checks bind When and TransitionTo to
the declared state union. They do not serialize methods or protect asynchronous
completion order.

Two calls can both pass a guard in state A, resolve in reverse order, and commit
different destination states. Document this limitation. Using a serialization
operator outside the method is a consumer choice when operations must run in
order.

| Candidate | Benefit | Contract cost |
| --- | --- | --- |
| Optimistic state version | Capture a monotonically increasing machine version before execution; commit only if it still matches. Every successful transition, including transition back to the same named state, advances the version. | Must define version changes for direct transitionTo(), inherited decorators, and nested transitions. Reading only the state string misses A-to-B-to-A changes. |
| Reject stale transition | Following successful user work, reject with an explicit stale-transition error if the captured version is obsolete. The state stays at the newer version. | Method side effects have already happened. Rejection cannot roll them back and may cause a retry to duplicate them. Silently returning success while skipping the transition would be a different contract. |
| Serialize transitions | Hold one machine-local permit from guard evaluation until execution and transition finish. | Changes start order, latency, rejection timing, and reentrancy. A nested transition waiting for its own permit can deadlock; manual transitionTo() requires a defined interaction. |

For a later opt-in API, investigate optimistic versioning plus explicit stale
rejection first because it does not introduce a scheduler. Keep serialization a
separate explicit policy. Do not change the default decorators, add a silent
last-writer rule, or promise transaction rollback. Approval requires tests for
reverse completion, rejection, manual transition, same-state transitions,
reentrancy, and inheritance before selecting public syntax.

## AsyncStore integration requirements

**Recommendation: retain the existing store APIs, produce this RFC only, and
defer operator integration and distributed locking.** AsyncStore CRUD,
AtomicAsyncStore.update, capabilities checks, AsyncMemoryStore, RemoteAsyncStore
and the optional Node context already exist. A read followed by set does not
become atomic because the implementation is asynchronous or remote.

| Operator | State to externalize | Atomicity and consistency | TTL and failures | Required capability and missing contract |
| --- | --- | --- | --- | --- |
| cachedFor | Serializable successful value, cache identity, expiration metadata. An in-process pending promise and caller signals are not portable store values. | Basic CRUD can provide a best-effort cache; preventing cross-process cache stampedes needs a separate atomic ownership mechanism. Stale-write prevention needs versions or compare-and-set. | Store expiry and library TTL must agree on units and start time. A cache transport failure needs an explicit bypass-versus-reject policy; do not silently cache the transport error as a business result. | TTL support when expiration is requested. No distributed deduplication claim from CRUD alone. Serialization/key namespace and local pending work remain separate concerns. |
| circuitBreaker | Consecutive failures, state, open timestamp, probe lease and generation/token. | All relevant state transitions and ownership checks must be atomic per logical breaker; strong consistency is needed for a global probe limit. | Probe ownership expires but stale settlement must be fenced. Network uncertainty cannot be treated as successful recovery or automatically counted as a business failure. | atomic plus circuitBreaker capabilities, and a provider-proven atomic transition/ownership contract. Memory update only coordinates within its own instance. |
| keyedLock | Lease owner token, expiry, renewal state, fencing sequence and waiting ownership. | Atomic acquire-if-free and compare-owner release/renew; strong consistency. Releasing another owner's lease must be impossible. | Lease expiry permits replacement; a paused old holder may resume. A timeout means ownership can be uncertain. Protected downstream writes need fencing enforcement where required. | atomic plus locks capabilities are necessary but not sufficient evidence of safe distributed locking. Current CRUD and generic update signatures do not establish provider-specific fencing or lease guarantees. |
| semaphore | Permit lease owners, permit count, expirations and fencing tokens where the protected resource needs them. | Atomic multi-owner admission and compare-owner release, with a global active <= permits invariant over valid leases. Local FIFO does not imply distributed FIFO. | Abandoned owners need leases and renewal. Network partition/expiry can leave work running after ownership expires; physical concurrency cannot be guaranteed for uncooperative work by leases alone. | A provider contract for atomic permit ownership, not just a numeric counter. Existing capabilities have no semaphore-specific guarantee; do not invent one by interpreting locks=true. |

Provider designs must define clock assumptions, lease duration and renewal,
ownership tokens, compare-and-set semantics, fencing enforcement, retry safety,
and behavior after an unknown network outcome. Fail-open versus fail-closed
cannot be chosen once for all four operators: it is a public behavior decision
for each integration. RemoteAsyncStore deliberately exposes CRUD and downgrades
atomic/lock/breaker capabilities; do not bypass that boundary.

No Redis client, remote calls in the current sync paths, or distributed-locking
export is introduced by this RFC. A future integration must explicitly account
for the fact that store I/O makes an otherwise synchronous fast path async.

## Vendor observability recipes

**Recommendation: keep EventSink as the sole operator-facing abstraction.**
LoggerEventSink and NoopEventSink already exist. Add corrected examples and, if
useful, recipes in application code; no OpenTelemetry or Prometheus dependency
belongs in core or operators.

The actual contract is PolicyEvent with a dotted `kind`, numeric Unix-millisecond
timestamp, operationId, operator and readonly metadata. Vendor recipes must use
that contract rather than obsolete event names or nonexistent error exports.

A metrics recipe can map selected event kinds to counters using a consumer-owned
counter facade. Use bounded labels such as operator/kind. Do not put arbitrary
operation IDs, keys or metadata into metric labels. Logging can use the existing
adapter without another integration layer.

An OpenTelemetry recipe can add PolicyEvents to a caller-owned span or record
them as events through an injected application callback. Existing events do not
provide a complete start/end lifecycle for every operation, and operationId is
not a trace/span ID. Do not synthesize authoritative duration spans from cache
hits, circuit state transitions or retry attempts. A span-per-operation wrapper
would require a separate explicitly reviewed lifecycle contract.

Examples must remain opt-in and isolate adapter failures. No automatic telemetry,
Node-only context dependency in core, background exporter, global tracer or
vendor-specific PolicyEvent is proposed.

## Explicit testing handles

**Recommendation: retain cache handles as-is and avoid adding reset APIs without
a demonstrated use case.** memoizeWithHandle and cachedForWithHandle expose
`{ operator, handle }`; their handle supports invalidate(key) and clear(). It has
no size property. Invalidating a pending entry does not cancel its consumers.

No breaker, lock or semaphore reset handle is currently part of the public
contract. In tests, constructing a fresh operator/application isolates state
without a registry. Do not introduce resetEverything(), global cache lists, or
weakly tracked registries just to support test teardown.

Any later handle must distinguish observation from mutation. A lock/semaphore
reset cannot revoke a real active holder or set a permit count to zero while
work continues. A breaker reset must invalidate old probe generations. A cache
size API must define whether expired entries, pending entries and per-receiver
partitions count; WeakMap partitions are not iterable. These are separate API
decisions, not implied additions to the existing CacheHandle interface.

## Scope of this document

All sections above are design proposals or explicit deferrals. No proposal is
implemented merely because it is described here. Public syntax, new errors,
exports, event variants and SemVer remain orchestrator decisions. Approved
implementation work still requires tests, review of emitted declarations, full
CI/package checks, and an entrypoint-size comparison.
