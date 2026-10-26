---
sidebar_position: 5
---

# Reusable Policies with `definePolicy`

`definePolicy` groups the same functional resilience operators into an **immutable and validated** configuration that you can reuse across multiple pipelines or extend into new derived policies.

## Import

```ts
import { definePolicy } from 'annotations-design-patterns/policy';
import { pipe } from 'annotations-design-patterns/pipe';
```

## Basic syntax

```ts
const profilePolicy = definePolicy<Receiver, Args, Return>({
  fallback: { value: defaultValue },
  circuitBreaker: { failures: 3, resetMs: 5_000 },
  retry: { attempts: 3, delayMs: 100, idempotent: true },
  timeout: { ms: 1_000 },
});
```

**Only enable the layers you need.** Missing ones or `false` are disabled.

## Default order

Layers execute in this order (outside to inside):

1. **fallback** — outermost, catches and returns value
2. **circuitBreaker** — brakes after failures
3. **retry** — retries
4. **timeout** — innermost (limits time)

This is the most logical order for resilience: if everything fails, the fallback catches it.

## Complete example

```ts
const profilePolicy = definePolicy<object, readonly [id: string], string>({
  fallback: { value: 'unavailable' },
  circuitBreaker: { failures: 3, resetMs: 5_000 },
  retry: { attempts: 3, delayMs: 100, idempotent: true },
  timeout: { ms: 1_000 },
});

const loadProfile = pipe(
  async (id: string) => fetchProfile(id),
  profilePolicy.operator(),
);

// Use it
const profile = await loadProfile.call({}, '42');
```

## Extend a policy

Use `.extend()` to create a new policy with overridden options:

```ts
const stricterPolicy = profilePolicy.extend({
  retry: { attempts: 5, delayMs: 50, idempotent: true },
  timeout: { ms: 500 },
});

const strictLoad = pipe(fetchProfile, stricterPolicy.operator());
```

The original policy **does not change** — `.extend()` returns a new one.

## Validation

`definePolicy` validates the configuration **before the first invocation**:

- **`retry` requires `idempotent: true`** — retry policies without idempotence guarantee are rejected with `InvalidPolicyError`.
- **Dangerous combinations are detected** — e.g., a policy that cannot guarantee correctness throws an error when compiled, not when executed.

## Available layers

- `fallback: { value: T | () => T }` — Value or function that returns fallback
- `circuitBreaker: { failures: number, resetMs: number }` — Opens after N consecutive failures
- `retry: { attempts: number, delayMs?: number, backoffFactor?: number, idempotent: boolean }` — Retries with backoff
- `timeout: { ms: number }` — Time limit

All are optional. Pass `false` to disable a specific layer:

```ts
const noRetry = profilePolicy.extend({ retry: false });
```

## PolicyDefinition methods

### `operator()`

Returns a functional operator for use in `pipe`:

```ts
const pipeline = pipe(method, policy.operator());
```

### `extend(overrides)`

Returns a new policy with changes:

```ts
const derived = policy.extend({ retry: { attempts: 5, idempotent: true } });
```

### `describe()` (advanced)

Generates a text description of the policy (useful for logs):

```ts
console.log(policy.describe());
// "Fallback('unavailable') → CircuitBreaker(3/5000ms) → Retry(3x) → Timeout(1000ms)"
```

## For types and advanced options

See the [Policy Reference](/docs/api/policy).
