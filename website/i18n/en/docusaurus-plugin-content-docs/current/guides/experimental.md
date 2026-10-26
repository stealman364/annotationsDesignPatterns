---
sidebar_position: 9
---

# Experimental: `switchOverlap` and `hedge`

Two operators under investigation that **are not stable APIs**. Use them only if you know what you're doing and accept that their behavior or signature may change in future versions.

## `switchOverlap`

Deduplication with channel switch when an operation fails.

```ts
import { switchOverlap } from 'annotations-design-patterns/experimental';

const load = pipe(
  fetchData,
  switchOverlap({ key: ({ args }) => args[0], backoffMs: 100 }),
);
```

**Behavior:**
- First call starts the operation
- Subsequent calls with the same key wait
- If it fails, waiters are activated and can retry independently (channel switch)

**Why experimental:**
- The semantics of "switch" vs "independent retries" are not fully validated in production
- There may be edge cases with timeouts and backoff

## `hedge` (Hedged requests)

Launches multiple requests in parallel and returns the first successful one.

```ts
import { hedge } from 'annotations-design-patterns/experimental';

const fastFetch = pipe(
  fetch,
  hedge({ delayBeforeHedgeMs: 100, maxHedges: 2 }),
);
```

**Behavior:**
- First call executes immediately
- If it doesn't finish in `delayBeforeHedgeMs`, a second copy is launched
- Returns the first to complete successfully
- Cancels the rest

**Why experimental:**
- The use of cancellations (`AbortSignal`) is evolving
- Validation in real-world scenarios is ongoing
- Can be costly for heavyweight operations

## Stable alternative

For most production cases, **use `overlap` with `mode: 'share'`** or `definePolicy` with the stable layers:

```ts
// Stable: shares result without complex cancellations
const safeFetch = pipe(
  fetch,
  overlap({ mode: 'share', key: ({ args }) => args[0] }),
);

// Or with policy:
const policy = definePolicy({ retry: { attempts: 3, idempotent: true } });
const load = pipe(fetch, policy.operator());
```

## Location in the codebase

Both operators live in `/api/experimental`:

```ts
import type { SwitchOverlap, Hedge } from 'annotations-design-patterns/experimental';
```

For complete documentation (though subject to change), see the [Experimental Reference](/docs/api/experimental).

## Report issues

If you encounter unexpected behavior, report it on GitHub — the API and semantics are under active review.
