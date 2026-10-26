---
sidebar_position: 4
---

# Run: Execution with Context and Observability

`run` invokes a pipeline prepared with `pipe`, preserving the receiver and typed argument tuple, with optional support for observability (structured events).

## Basic syntax

```ts
import { run } from 'annotations-design-patterns/run';
import { pipe } from 'annotations-design-patterns/pipe';

const format = pipe<Receiver, readonly [id: string], string>(
  function (id: string) {
    return `account:${id}`;
  },
);

const result = run(receiver, ['42'] as const, format);
// result: string = 'account:42'
```

## Generics

```ts
run<Receiver, Args extends readonly unknown[], Return>(
  receiver: Receiver,
  args: Args,
  pipeline: (this: Receiver, ...args: Args) => Return,
  options?: RunOptions<Return>
): Return | Promise<Return>
```

**Args must be a typed readonly tuple** (use `as const` when passing the array).

## With observability

The fourth parameter `RunOptions` enables observability context (optional):

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { run } from 'annotations-design-patterns/run';

const events = new LoggerEventSink({
  log: (event) => console.info(event)
});

const load = pipe(
  async (id: string) => fetchProfile(id),
  retry({ attempts: 3 }),
);

await run(
  {},
  ['42'] as const,
  load,
  {
    operationId: 'profile-42',
    metadata: { requestId: 'request-7' },
    eventSink: events,
  }
);
```

## Flow

1. **Without observability (3 parameters):** `run(receiver, args, pipeline)` simply invokes the pipeline.
2. **With observability (4 parameters):** each operator emits events (`retry-attempt`, `timeout-exceeded`, etc.) to the configured sink.

Events include:
- Type (`retry-attempt`, `circuit-open`, etc.)
- Timestamp
- Context (`operationId`, `metadata`, argument tuple)

## Complete example

```ts
import { run } from 'annotations-design-patterns/run';
import { pipe } from 'annotations-design-patterns/pipe';
import { retry, fallback } from 'annotations-design-patterns/operators';
import { LoggerEventSink } from 'annotations-design-patterns/observability';

const api = { baseUrl: 'https://api.example.com' };

const getUser = pipe<typeof api, readonly [id: string], User>(
  async function (id: string): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  retry({ attempts: 3, delayMs: 100 }),
  fallback<typeof api, readonly [id: string], User>({ name: 'Unknown' } as User),
);

const sink = new LoggerEventSink({
  log: (event) => console.log(`[${event.type}]`, event.metadata),
});

const user = await run(
  api,
  ['42'] as const,
  getUser,
  { operationId: 'fetch-user', eventSink: sink }
);
```

## For types and options

See the [Run Reference](/docs/api/run).
