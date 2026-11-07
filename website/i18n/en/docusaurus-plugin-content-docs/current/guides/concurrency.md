---
sidebar_position: 7
---

# Concurrency and invalidation

Apply operators using pipe. Choose whether you need to share execution, permits,
or cached results.

| API | Contract |
| --- | --- |
| overlap drop | One execution per key; overlapping calls reject with OverlapDroppedError |
| overlap share | Shares active work/result per key; signals remain caller-specific |
| overlap queue | One execution per key with a FIFO queue |
| keyedLock | Keyed mutual exclusion with queued-abort withdrawal |
| semaphore | Up to N executions per pool or key with a FIFO queue |
| @Semaphore / @Mutex | Per-instance permits; Mutex equals one permit |
| @RateLimit | Per-instance time window; excess void calls are discarded |

There is no stable functional rateLimit in this version. Its design remains in
repository POST-2.1-RFCS.md.

## Functional Semaphore

~~~ts
import { semaphore } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const limited = pipe<object, readonly [tenantId: string], string>(
  async (tenantId) => tenantId,
  semaphore({ permits: 4, maxQueue: 100, key: ({ args }) => args[0] }),
);
await run({}, ['tenant-a'], limited, { operationId: 'limited-call' });
~~~

Without a key, an applied pipeline shares one pool across receivers. The resolver
receives readonly context; an explicit run key overrides it. permits requires a
positive safe integer and maxQueue a non-negative safe integer. Omitted maxQueue
keeps an unbounded queue.

Calls always return a Promise while admitted work starts synchronously. A permit
remains held until inner execution settles. Active cancellation stops the
caller's wait but does not release still-running work. Pre-aborted signals
prevent execution; aborted waiters withdraw and free queue capacity. Direct
handoff preserves FIFO without barging.

A full queue rejects with SemaphoreQueueFullError and code POLICY_ERROR. This is
an ordinary policy error: retry, fallback and an outer CircuitBreaker can act on
it according to composition. Filter such errors explicitly when needed, for
example using isFailure. Caller cancellation keeps its separate treatment.

## Composition order

An outer semaphore keeps a permit across every retry attempt and delay. An outer
retry reacquires a semaphore permit per attempt. The former limits complete
logical operations; the latter limits each admitted execution. Choose according
to the resource being protected.

@Semaphore remains per-instance and adapts the same operator. Existing events
are semaphore.queued, semaphore.acquired and semaphore.released; they do not
automatically include key.

## Overlap and keyedLock

~~~ts
import { overlap, keyedLock } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

type Args = readonly [id: string];
const shared = pipe<object, Args, string>(
  async (id) => id,
  overlap({ mode: 'share', key: ({ args }) => args[0] }),
);
const locked = pipe<object, Args, string>(
  async (id) => id,
  keyedLock({ key: ({ args }) => args[0], maxQueue: 100 }),
);
~~~

drop rejects overlapping calls; share returns the shared result. With signals,
consumers may receive distinct promises racing their own signals. Cancelling
the initiator does not cancel other consumers. Work may continue even after all
consumers abandon it; there is no reference-counted cancellation.

overlap queue and keyedLock wait by key and reject when their queues fill.
Aborted waiters withdraw before execution. Their event and error names remain
specific to each operator. operationId correlates observations; the concurrency
key comes from the resolver or run.key.

## Cache handles

~~~ts
import { cachedForWithHandle } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

const cache = cachedForWithHandle<object, readonly [id: string], string>(
  60_000,
  { key: (id) => id, maxEntries: 1_000 },
);
const load = pipe((id: string) => id, cache.operator);

load.call({}, '42');
cache.handle.invalidate('42');
cache.handle.clear();
~~~

CacheHandle has invalidate(key: string): void and clear(): void. Invalidation
does not cancel pending consumers. WithHandle variants do not accept perReceiver
and expose no size. Non-handle caches default to pipeline sharing; perReceiver
true adds WeakMap partitions by object or function.

maxEntries retains insertion-order entries, including pending results; hits do
not reorder. Capacity eviction emits cache.invalidated. Only bounded caches
prune expired entries on misses, without TTL events or timers. TTL starts at
invocation. See the [2.2 migration guide](../migration/2.2.md) for limits and JSON
key semantics.

switchOverlap and hedge remain in the experimental entrypoint.
[Operator reference](/docs/api/operators).
