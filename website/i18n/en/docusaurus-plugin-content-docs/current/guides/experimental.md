---
sidebar_position: 9
---

# Experimental APIs

These operators are opt-in and may change in future releases. Review their concurrency and cancellation behavior before using them in production.

## `switchOverlap`

`switchOverlap` implements latest-call-wins for overlapping calls with the same key. A new call rejects the previous caller with `OverlapSupersededError` and starts its own work.

```ts
import { switchOverlap } from 'annotations-design-patterns/experimental';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const load = pipe(
  fetchData,
  switchOverlap<object, readonly [string], Data>({
    key: ({ args }) => args[0],
  }),
);
```

Superseding a call rejects its result but does not stop its underlying work. JavaScript cannot cancel that work unless the operation itself cooperates with cancellation. This operator does not queue waiters or deduplicate their result.

## `hedge`

`hedge` starts the operation immediately and starts one duplicate after `delayMs` if no call has succeeded by then. It returns the first successful result. The operation must be idempotent because both calls may perform work. The operator does not cancel the losing call; it may continue after the returned promise settles. If both calls fail, the returned promise rejects.

```ts
import { hedge } from 'annotations-design-patterns/experimental';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const fastFetch = pipe(
  fetchData,
  hedge<object, readonly [string], Data>({ delayMs: 100, idempotent: true }),
);
```

`delayMs` must be a finite non-negative number. The API does not provide a `maxHedges` option; this implementation launches at most one duplicate.

## New experimental APIs in 2.3

The 2.3 release candidate adds experimental cancellation sharing for `memoize`, `cachedFor`, and `overlap` in `share` mode through `cancelWhenUnused`. A shared operation receives an abort signal when its last interested caller withdraws. The underlying work stops only if it honors that signal; cache eviction and invalidation do not count as callers withdrawing.

`observeOperation` records the outcome and duration visible at its position in an operator pipeline. Invocation details are opt-in. It observes the caller's result, which may finish before shared backend work does.

`asyncCachedFor` uses an explicitly TTL-capable asynchronous provider, a key, namespace, schema version, codec, failure policy, and I/O deadline. A deadline bounds how long the caller waits; it cannot guarantee that an already-started provider request has stopped. `VersionedMemoryStore` is a local reference implementation of compare-and-set semantics, not a distributed coordination service.

See the [2.3 migration guide](../migration/2.3.md) for release status, behavioral guarantees, and additional limits. The [experimental API reference](/docs/api/experimental) has the exported signatures.

## Stable alternatives

For in-process callers that should share a result instead of superseding one another, use the stable `overlap` operator with `mode: 'share'`:

```ts
import { overlap } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const safeFetch = pipe(
  fetchData,
  overlap<object, readonly [string], Data>({
    mode: 'share',
    key: ({ args }) => args[0],
  }),
);
```

For retries and fallback behavior, use the stable `definePolicy` API from `annotations-design-patterns/policy`.

## Report issues

If you find unexpected behavior, please report it in the repository issue tracker with the package version and a minimal reproduction.
