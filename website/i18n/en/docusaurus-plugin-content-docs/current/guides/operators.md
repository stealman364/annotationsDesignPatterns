---
sidebar_position: 2
---

# Functional API: Operators and Composition

Besides decorators, you can use a functional API without decorators: **`pipe`**, **functional operators**, and **`run`** to compose pipelines that execute against a receiver (object) with an explicit tuple of arguments.

## Import

```ts
import { fallback, retry, timeout, circuitBreaker } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
```

## Available operators

Functional operators map 1:1 with resilience decorators:

- `fallback(value | fn)` — Fallback
- `retry(options)` — Retries
- `timeout(ms)` — Time limit
- `circuitBreaker(options)` — Breaks after failures
- `overlap(options)` — Deduplication by key
- `keyedLock(options)` — Serialization by key
- `memoize(options)` / `memoizeWithHandle(options)` — Cache
- And more...

## Example 1: Synchronous pipeline

A synchronous pipeline preserves its synchronous return when its operators allow it:

```ts
const safeDivide = pipe<object, readonly [divisor: number], number>(
  function (this: object, divisor: number): number {
    if (divisor === 0) throw new Error('division by zero');
    return 100 / divisor;
  },
  fallback<object, readonly [divisor: number], number>(0)
);

// Use it as a normal function
safeDivide.call({}, 0); // 0 (fallback)
safeDivide.call({}, 2); // 50
```

**`pipe` accepts:**
1. A base function (receiver, args, return)
2. Zero or more operators (applied from outside to inside)

**Generics:**
- `<ReceiverType, readonly [arg1, arg2, ...], ReturnType>`

## Example 2: Asynchronous pipeline

When operators or the method are async, the pipeline returns Promise:

```ts
const load = pipe<object, readonly [id: string], string>(
  async function (this: object, id: string): Promise<string> {
    return fetchProfile(id);
  },
  retry<object, readonly [id: string], string>({ attempts: 3 }),
);

const profile = await load.call({}, '42');
```

## Composition with multiple operators

The order in `pipe` is: **the first operator is the outermost**. They execute from outside to inside:

```ts
const safeFetch = pipe<API, readonly [id: string], User>(
  async (id: string) => API.getUser(id),
  timeout<API, readonly [id: string], User>(5000),      // 1st (outermost)
  retry<API, readonly [id: string], User>({ attempts: 3 }), // 2nd
  fallback<API, readonly [id: string], User>(DEFAULT_USER)  // 3rd (innermost)
);
```

Execution order: fallback → retry → timeout → method.

## For `pipe` and `run` in detail

See the dedicated guides: [Pipe](pipe) and [Run](run).

## For specific operators

See the [Operators Reference](/docs/api/operators) for:
- Exact options for each operator
- Error handling
- Queue and deduplication semantics
- Handles for cache invalidation
