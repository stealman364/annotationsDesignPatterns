---
sidebar_position: 6
---

# Observability: Errors and Events

The library emits structured events from functional operators without adding logging dependencies. Decorators can catch specific errors like `TimeoutError` or `CircuitBreakerOpenError`.

## Specific errors

### `PolicyError`

Base class for policy errors. Exposes:

- `code: PolicyErrorCode` — stable code (`'TIMEOUT'`, `'CIRCUIT_OPEN'`, `'SEMAPHORE_TIMEOUT'`, etc.)
- `cause: unknown` — original error that caused the rejection
- `metadata: Readonly<Record<string, unknown>>` — operation context

```ts
import { TimeoutError, CircuitBreakerOpenError } from 'annotations-design-patterns/observability';

try {
  await method.call(receiver);
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log(`Timeout after ${e.metadata.ms}ms`);
  } else if (e instanceof CircuitBreakerOpenError) {
    console.log('Circuit is open');
  }
}
```

### `TimeoutError`

Thrown when an async method exceeds the `@Timeout(ms)` limit.

- `code: 'TIMEOUT'`
- `metadata: { ms: number }` — limit in milliseconds

### `CircuitBreakerOpenError`

Thrown when the circuit opens after N consecutive failures.

- `code: 'CIRCUIT_OPEN'`
- `metadata: { failures: number, resetMs: number }`

### `SemaphoreTimeoutError`, `MutexTimeoutError`

Thrown if the timeout is reached waiting for a slot in `@Semaphore` or `@Mutex`.

## Events with `LoggerEventSink`

The functional API can emit structured events through a custom sink:

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { retry } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const events = new LoggerEventSink({
  log: (event) => console.info(event)
});

const load = pipe(fetchProfile, retry({ attempts: 3 }));

await run(api, ['42'] as const, load, {
  operationId: 'profile-42',
  metadata: { requestId: 'request-7' },
  eventSink: events,
});
```

### Event structure

Each event includes:

```ts
{
  type: string;                              // 'retry-attempt', 'circuit-open', etc.
  timestamp: Date;
  metadata: {
    operationId: string;
    requestId?: string;
    args: readonly unknown[];
    // + event-specific metadata
  };
}
```

### Event types

- `retry-attempt` — retry in progress
- `circuit-open` — circuit opened, operation rejected
- `timeout-exceeded` — timeout reached
- `fallback-triggered` — fallback returned
- And more depending on active operators

## Custom sink

Implement the `EventSink` interface to capture events in your logging system:

```ts
import type { EventSink, ResilienceEvent } from 'annotations-design-patterns/observability';

class MyEventSink implements EventSink {
  emit(event: ResilienceEvent): void {
    // Send to your logging system (Winston, Pino, etc.)
    logger.info(`[${event.type}]`, {
      operationId: event.metadata.operationId,
      ms: event.metadata.ms,
    });
  }
}

await run(api, args, pipeline, {
  operationId: 'my-op',
  eventSink: new MyEventSink(),
});
```

## Error lifecycle

**User errors propagate unwrapped.** Only `PolicyError` wraps operations that fail due to policy (timeout, circuit breaker, etc.):

```ts
try {
  await method.call(receiver);
} catch (e) {
  if (e instanceof TimeoutError) {
    // Caused by timeout, not by the user
  } else if (e instanceof TypeError) {
    // User error: propagates as-is
  }
}
```

## For exact types and detailed events

See the [Observability Reference](/docs/api/observability).
