---
sidebar_position: 6
---

# Observability: errors and events

EventSink is the engine's small synchronous contract. Contextual functional
pipelines emit events when run receives a sink; logging, transport, tracing and
metrics remain outside the engine.

## Actual exports and logger

`/observability` exports EventSink and PolicyEvent types, LoggerEventSink and
NoopEventSink classes, and StructuredLogger/LoggerEventSinkOptions types. Import
errors from their corresponding entrypoints, such as `/operators` or `/policy`.

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { retry } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const sink = new LoggerEventSink(
  { log: (event) => console.info(event.kind, event.operationId) },
  { operators: ['retry'] },
);
const load = pipe<object, readonly [id: string], string>(
  async (id) => id,
  retry({ attempts: 3 }),
);
await run({}, ['42'], load, {
  operationId: 'profile-42',
  metadata: { requestId: 'request-7' },
  eventSink: sink,
});
```

The first argument is a logger with a log method; the second is an optional
operator filter. NoopEventSink discards events. Synchronous sink failures do not
change the operation result. emit does not await Promises: asynchronous sinks
must manage their own errors and transport.

## PolicyEvent schema

Readonly top-level fields are kind, operator, operationId, timestamp and metadata.
**timestamp is a number: Unix epoch milliseconds**, not Date. operationId is not
nested inside metadata. metadata contains explicit run values; args, receiver
and signal are not included automatically.

| Kinds | Additional top-level fields |
| --- | --- |
| `retry.attempt` | attempt |
| `retry.exhausted` | attempt, error |
| `timeout.triggered` | timeoutMs |
| `circuit.open`, `circuit.half_open`, `circuit.closed` | None |
| `cache.hit`, `cache.miss` | None |
| `cache.rejected` | error |
| `cache.invalidated` | key: string |
| `fallback.used` | error |
| `semaphore.queued`, `semaphore.acquired`, `semaphore.released` | None |
| `overlap.started`, `overlap.queued`, `overlap.dropped`, `overlap.completed` | key: PropertyKey |
| `keyedLock.queued`, `keyedLock.acquired`, `keyedLock.released` | key: PropertyKey |

```ts
import type { EventSink, PolicyEvent } from 'annotations-design-patterns/observability';

const sink: EventSink = {
  emit(event: PolicyEvent): void {
    if (event.kind === 'timeout.triggered') {
      console.info(event.operationId, event.timeoutMs, event.timestamp);
    }
  },
};
```

circuit.open is a state transition, not every open-circuit rejection. There is
no universal operation-ended event: overlap.completed or semaphore.released may
occur after caller cancellation. Do not infer a whole request or span lifetime
from one policy event.

## Errors and metadata

```ts
import { TimeoutError, CircuitBreakerOpenError, isPolicyError } from 'annotations-design-patterns/operators';
```

PolicyError exposes code, readonly metadata and a configured cause. Business
errors and signal.reason propagate unwrapped. run metadata is not automatically
copied into each error.

| Class | Entrypoint | Code / own fields |
| --- | --- | --- |
| TimeoutError | `/operators` | TIMEOUT; does not add ms metadata by default |
| CircuitBreakerOpenError | `/operators` | CIRCUIT_OPEN; does not add failures/resetMs metadata |
| SemaphoreQueueFullError | `/operators` | POLICY_ERROR; optional key |
| OverlapDroppedError / OverlapQueueFullError | `/operators` | OVERLAP_DROPPED / OVERLAP_QUEUE_FULL; key |
| KeyedLockQueueFullError | `/operators` | KEYED_LOCK_QUEUE_FULL; key |
| InvalidPolicyError | `/policy` | INVALID_POLICY; path and metadata.path |

To observe a timeout limit, narrow timeout.triggered and read timeoutMs.
Semaphore and Mutex do not add their own wait timeout; compose it using signals
and policies.

## External tracing and metrics recipes

`examples/event-sink-recipes.ts` is a repository file to copy into your
application. createSpanEventSink and createCounterSink **are not npm exports**.
They accept synchronous callbacks without importing SDKs.

For a span already owned by your application:

```ts
// Import from your application's copy of the recipe.
import { createSpanEventSink } from './event-sink-recipes';

const sink = createSpanEventSink((name, attributes, timestampMs) => {
  span.addEvent(name, attributes, timestampMs);
});
```

OpenTelemetry's addEvent accepts a name, attributes and time; TimeInput accepts
epoch milliseconds. Your application owns the span and decides when to call end.
See [Span](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Span.html) and
[TimeInput](https://open-telemetry.github.io/opentelemetry-js/types/_opentelemetry_api._opentelemetry_api.TimeInput.html).

The counter recipe keeps label cardinality bounded:

```ts
import { createCounterSink } from './event-sink-recipes';

const sink = createCounterSink((kind, { operator }) => {
  counter.inc({ kind, operator });
});
```

Configure your application-owned counter with kind/operator labelNames. The
client documents typed labels using as const. Do not turn IDs, keys, arguments
or metadata into labels. See the official
[typed-label documentation](https://github.com/prometheus/client_js#strongly-typed-labels).

The library neither starts nor ends spans and registers no global metrics.
Keep SDKs and exporters in your application or a separate optional adapter.
[Exact observability reference](/docs/api/observability).
