---
sidebar_position: 3
---

# Pipe: Operator Composition

`pipe` is the base function that takes a method and zero or more functional operators, returning a pipeline function that preserves the types of receiver, arguments, and return.

## Syntax

```ts
import { pipe } from 'annotations-design-patterns/pipe';

const pipeline = pipe<Receiver, readonly [Arg1, Arg2], Return>(
  function methodOrPipeline(this: Receiver, arg1: Arg1, arg2: Arg2): Return | Promise<Return> {
    // your logic
  },
  operator1<Receiver, readonly [Arg1, Arg2], Return>(...),
  operator2<Receiver, readonly [Arg1, Arg2], Return>(...),
);
```

**Important:** all operators in the same pipeline must have **the same generics** — the receiver, arguments tuple, and return type cannot change between operators.

## Example: resilience stack

```ts
const safeFetch = pipe<object, readonly [url: string], Promise<Response>>(
  async function (this: object, url: string): Promise<Response> {
    return fetch(url);
  },
  timeout<object, readonly [url: string], Promise<Response>>(5000),
  retry<object, readonly [url: string], Promise<Response>>({ attempts: 3 }),
  fallback<object, readonly [url: string], Promise<Response>>(
    new Response('{}', { status: 503 })
  ),
);

// Use it
await safeFetch.call({}, 'https://api.example.com/data');
```

## Operator order: outside to inside

The **first operator in the list is the outermost**. Execution flows:

1. External call → first operator (outermost)
2. → second operator
3. → ... more operators ...
4. → base method (innermost)
5. ← response

In the example above:
- `timeout` is the outermost (detects slow operations)
- `retry` retries after timeout
- `fallback` returns a default value if everything fails
- The `fetch` method is the innermost

## Preserves synchrony when possible

If all operators and the base method are synchronous, the pipeline returns synchronously:

```ts
const compute = pipe<object, readonly [n: number], number>(
  function (n: number) {
    return n * 2;
  },
  fallback<object, readonly [n: number], number>(0),
);

// Returns number, not Promise
const result = compute.call({}, 5); // 10
```

If any operator or method is async, the pipeline returns a Promise.

## Invocation

The returned pipeline is invoked as a normal function, with `.call(receiver, ...args)`:

```ts
const result = await pipeline.call(receiver, arg1, arg2);
```

For invoking with typed arguments and integrated observability context, use [`run`](run).

## For composition details

See the [Pipe Reference](/docs/api/pipe).
