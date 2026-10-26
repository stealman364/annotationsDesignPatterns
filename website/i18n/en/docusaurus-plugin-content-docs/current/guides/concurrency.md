---
sidebar_position: 7
---

# Concurrency and Invalidation

For concurrent operations, use `overlap` (deduplication by key), `keyedLock` (serialization by key), or caches with handles (explicit control of invalidation).

## `overlap`: deduplication and FIFO queue

`overlap` prevents multiple calls with the same key from executing the method in parallel. Offers three modes:

### `drop` — ignores duplicate calls

```ts
import { overlap } from 'annotations-design-patterns/operators';

@overlap({ mode: 'drop', key: ({ args }) => args[0] })
async getUser(id: string): Promise<User> {
  return fetch(`/users/${id}`).then(r => r.json());
}

// First call with id='42' starts
const p1 = getUser('42');
// Second call with id='42' is ignored (returns undefined)
const p2 = getUser('42');
```

### `share` — shares result

```ts
@overlap({ mode: 'share', key: ({ args }) => args[0] })
async getUser(id: string): Promise<User> {
  return fetch(`/users/${id}`).then(r => r.json());
}

// First and second call with id='42' return the same Promise
const p1 = getUser('42');
const p2 = getUser('42');
// p1 === p2 (same Promise)
```

### `queue` (FIFO) — serializes with queue

```ts
@overlap({ mode: 'queue', key: ({ args }) => args[0] })
async saveUser(id: string, data: User): Promise<void> {
  return fetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(() => {});
}

// First call executes
const p1 = saveUser('42', { name: 'Ana' });
// Second call waits in queue
const p2 = saveUser('42', { name: 'Bob' });
// p2 executes only after p1 completes
```

## `keyedLock`: serialization by key

`keyedLock` is similar to `overlap` with `mode: 'queue'`, but more controllable:

```ts
import { keyedLock } from 'annotations-design-patterns/operators';

@keyedLock({ key: ({ args }) => args[0] })
async updateProfile(id: string, data: Profile): Promise<void> {
  // Only one update per id concurrent
  return api.put(`/profiles/${id}`, data);
}
```

**Difference:** `keyedLock` makes waiters wait for the previous operation to complete; `overlap` with `queue` (although similar) has slightly different semantics in terms of aborts.

## Caches with handles: explicit invalidation

To have control over when to invalidate a cache, use `memoizeWithHandle` or `cachedForWithHandle`:

```ts
import { memoizeWithHandle, overlap } from 'annotations-design-patterns/operators';

const deduplicate = overlap({ mode: 'share', key: ({ args }) => args[0] });
const cache = memoizeWithHandle({ key: (id: string) => id });

const load = pipe(
  loadProfile,
  deduplicate,
  cache.operator
);

// Use it
const profile = await load.call({}, '42');

// Invalidate one entry
cache.handle.invalidate('42');

// Clear entire cache
cache.handle.clear();
```

### `MemoizeHandle<K>` API

- `invalidate(key: K): boolean` — Deletes one entry, returns `true` if it existed
- `clear(): void` — Deletes entire cache

## Custom key resolver

Both `overlap`, `keyedLock`, and `memoizeWithHandle` accept a custom key resolver:

```ts
const cache = memoizeWithHandle({
  key: (user: User) => user.id  // Extract user ID
});

const deduplicate = overlap({
  mode: 'share',
  key: ({ args }) => {
    const [id, options] = args;
    return `${id}:${options?.version ?? 'default'}`;
  }
});
```

## Coexistence with `run` and operationId

When you use `run` with an `operationId` and also have `overlap`/`keyedLock`, the `operationId` does not affect the key resolver — it's separate metadata for observability:

```ts
const load = pipe(fetchProfile, overlap({ mode: 'share', key: ({ args }) => args[0] }));

await run(
  api,
  ['42'] as const,
  load,
  { 
    operationId: 'profile-load-1',  // For logs/traces
    metadata: { requestId: '...' },
  }
);
```

## Note on experimentals

[`switchOverlap`](/docs/guides/experimental#switchoverlap) and [`hedge`](/docs/guides/experimental#hedge-hedged-requests) are experimental — not stable. Use `overlap` with `share` for most production cases.

## For details and limits

See the [Operators Reference](/docs/api/operators).
