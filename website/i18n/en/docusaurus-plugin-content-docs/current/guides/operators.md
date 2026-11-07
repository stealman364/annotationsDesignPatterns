---
sidebar_position: 2
---

# Functional API: operators and composition

pipe applies operators to a function and run adds explicit context with
operationId, metadata, EventSink, key and AbortSignal. Operators are composable
functions independent from class decorators.

~~~ts
import {
  fallback, retry, timeout, circuitBreaker, semaphore, memoize, cachedFor,
} from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
~~~

overlap, keyedLock, memoizeWithHandle and cachedForWithHandle are also available.
Experimental operators have their own entrypoint.

## Composition and return values

The first operator is outermost. This pipeline enters fallback, retry, timeout
and finally the method; results return outward.

~~~ts
const load = pipe<object, readonly [id: string], string>(
  async (id) => id,
  fallback('recovered'),
  retry({ attempts: 3, delayMs: 100, backoffFactor: 2 }),
  timeout(5_000),
);
await run({}, ['42'], load, { operationId: 'load-42' });
~~~

Synchronous pipelines keep synchronous results where their operators allow it;
timeout and semaphore always return Promises. Receivers and argument tuples are
preserved. Generic parameters are Receiver, readonly Args and Result.

## Retry and CircuitBreaker

Retry supports maxDelayMs and jitter none/full/equal. Exponential delay is capped
by the portable timer maximum and configured user limit before jitter. none is
the default. A zero final delay uses a cancellable microtask.

CircuitBreaker supports synchronous isFailure(error, info). info provides
readonly invocation data; false ignores the error without incrementing or
resetting failures and without treating it as success. HALF_OPEN releases its
probe without closing. Caller cancellation and stale generations bypass the
predicate.

~~~ts
const protectedRead = circuitBreaker<object, readonly [id: string], string>({
  failures: 5,
  resetMs: 30_000,
  isFailure: (error, info) => info.args[0] !== 'optional' && error instanceof Error,
});
~~~

Ignored errors still reject with their original reason. A throwing predicate
rejects with its decision error. Decorators and definePolicy share these options;
describe shows new options only when explicitly configured.

## Caches and capacity

memoize/cachedFor share by pipeline by default. perReceiver true isolates objects
and functions; primitive receivers produce TypeError. WithHandle variants expose
invalidate/clear and do not accept that flag.

cachedFor accepts positive-safe-integer maxEntries: insertion-order FIFO without
hit reordering. Pending entries count; eviction does not cancel consumers.
Bounded caches prune expired entries on misses without timers. TTL starts at
invocation; Infinity never expires and functional cachedFor(0) disables reuse.

Default keys remain JSON.stringify(args), with its collisions and limitations.
Supply key to identify special values or entities.
[Contracts and key table](../migration/2.2.md).

## Semaphore and cancellation

semaphore limits execution per pool or key, preserves FIFO and withdraws aborted
waiters. Active cancellation rejects the caller with signal.reason; ownership
lasts until inner execution settles. Other policies may treat
SemaphoreQueueFullError as an ordinary failure.

An outer semaphore retains its permit across retry attempts and delays; an
outer retry reacquires per attempt. The [concurrency guide](concurrency.md)
explains differences from overlap, keyedLock, Mutex and RateLimit.

Individual cancellation invokes no fallback and changes no breaker counter.
Shared operations isolate consumer signals and may continue after all consumers
abandon them. A timeout cannot forcibly stop code that ignores its signal.
See [Pipe](pipe.md), [Run](run.md) and the
[operator reference](/docs/api/operators).
