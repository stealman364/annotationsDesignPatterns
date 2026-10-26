---
sidebar_position: 1
---

# Welcome to annotations-design-patterns

**Design patterns as standard TC39 TypeScript decorators and as composable functions.** Classic GoF patterns, dependency injection, a complete resilience toolkit, and method utilities. Resilience and caching are also available as functional operators: see the [operators](./guides/operators.md) guide.

```ts
import { Singleton, Retry, Timeout, Fallback } from 'annotations-design-patterns';

@Singleton
class ApiClient {
  @Fallback<User[]>([])
  @Retry({ attempts: 3, delayMs: 200, backoffFactor: 2 })
  @Timeout(5000)
  async fetchUsers(): Promise<User[]> {
    /* ... */
  }
}
```

## Why this library?

- **Standard TC39 decorators** — works with TypeScript 5+ without `experimentalDecorators` or `reflect-metadata`. Classic collections are still tied to the legacy system.
- **Zero dependencies** — each pattern is self-contained and tree-shakeable.
- **Strict typing** — with type tests in addition to behavior tests; any `any` is bounded.
- **15 GoF patterns** + dependency injection + resilience + utilities, covered in this documentation.

## Requirements

- TypeScript **5.0+** with `ES2022` target or higher.
- **Do not** enable `experimentalDecorators`: this library uses standard decorators.
- Node 20+ (or any modern bundler).

## Installation

```bash
npm install annotations-design-patterns
```

## Next steps

Pick a guide from the sidebar based on what you want to do:

- **[GoF and resilience decorators](guides/decorators)** — complete catalog of classic and resilient patterns.
- **[Functional API with `pipe`, `run`, and operators](guides/operators)** — composition without decorators.
- **[Reusable policies with `definePolicy`](guides/policy)** — immutable and validated configuration.
- **[Observability: errors and events](guides/observability)** — event logging structure without dependencies.
- **[Concurrency and invalidation](guides/concurrency)** — `overlap`, `keyedLock`, and caches with handles.
- **[Async store and Node context](guides/store-node)** — integration with Node.js.
- **[Experimental: `switchOverlap` and `hedge`](guides/experimental)** — unstable APIs under investigation.

For a detailed reference of types and signatures, see the [API Reference](/docs/api/root).

> **Note:** The API reference (`/docs/api/*`) is currently available in Spanish only across all language locales. This is a known limitation: TypeDoc does not support native multilingual output, and the JSDoc comments in the source code are written in Spanish. Future versions may provide full English translations of the API documentation.
