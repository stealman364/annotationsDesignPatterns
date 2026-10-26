---
sidebar_position: 8
---

# Async Store and Node Context

For async storage (local or distributed) and context propagation in Node.js, the library offers two opt-in subpaths that **are not imported automatically** from the root entrypoint.

## AsyncMemoryStore

A local in-memory store with TTL (time-to-live) support and atomic operations:

```ts
import { AsyncMemoryStore } from 'annotations-design-patterns/store';

const store = new AsyncMemoryStore<string, number>();

// Store a value with TTL
await store.update('attempts', (value) => (value ?? 0) + 1, { ttlMs: 60_000 });

// Read a value
const attempts = await store.get('attempts');

// Verify the value has TTL
await store.requireAtomicStore(store, 'circuitBreaker');
```

### Methods

- `get(key: K): Promise<V | undefined>` — Reads a value
- `set(key: K, value: V, options?: { ttlMs?: number }): Promise<void>` — Sets a value
- `update(key: K, fn: (value: V | undefined) => V, options?: { ttlMs?: number }): Promise<void>` — Updates by applying a function
- `delete(key: K): Promise<boolean>` — Deletes one entry
- `clear(): Promise<void>` — Clears the entire store

### Atomicity and TTL

`requireAtomicStore(store, operationName)` validates that the store supports:
- **Atomic operations** — `get`/`set`/`update` without race conditions
- **TTL** — automatic expiration after `ttlMs`

Throws if the store doesn't guarantee both.

## Node Context with AsyncLocalStorage

`AsyncLocalStorage` (native in Node.js) lets you associate data with an async context without parameters:

```ts
import { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';

// At the start of an HTTP request
await runWithRequestContext({ requestId: 'req-42', userId: '123' }, async () => {
  // Inside, retrieve the context
  const ctx = getRequestContext();
  console.log(ctx?.requestId); // 'req-42'

  // Flows through async operations
  await someAsyncFunction();
});
```

### Methods

- `runWithRequestContext<T>(context: RequestContext, fn: () => T): Promise<T | Awaited<T>>` — Executes a function with context
- `getRequestContext(): RequestContext | undefined` — Reads the current context (or `undefined` if none)

### Use in middleware

```ts
// Example with Express
app.use((req, res, next) => {
  runWithRequestContext(
    { requestId: req.id, userId: req.user?.id },
    () => next()
  );
});

// In your handlers
app.get('/users/:id', async (req, res) => {
  const ctx = getRequestContext();
  const user = await fetchUser(req.params.id);
  console.log(`[${ctx?.requestId}] Loaded user ${ctx?.userId}`);
  res.json(user);
});
```

## Combination: store + context

You can combine them to store data per-request or per-session:

```ts
import { AsyncMemoryStore } from 'annotations-design-patterns/store';
import { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';

const requestStore = new AsyncMemoryStore<string, number>();

await runWithRequestContext({ requestId: 'req-42' }, async () => {
  const ctx = getRequestContext();
  
  // Store counters per request
  await requestStore.update(`${ctx?.requestId}:calls`, (v) => (v ?? 0) + 1);
});
```

## Limitations

- **AsyncMemoryStore is local to the process** — not distributed across instances. For clustered/distributed scenarios, use a remote store that implements the interface.
- **Node 20+ required** — `AsyncLocalStorage` is native since Node.js 12, but the `/node` subpath is only published for Node 20+.
- **Don't import in the browser** — `AsyncLocalStorage` doesn't exist in web clients.

## For types and advanced methods

See the [Store Reference](/docs/api/store) and [Node Reference](/docs/api/node).
