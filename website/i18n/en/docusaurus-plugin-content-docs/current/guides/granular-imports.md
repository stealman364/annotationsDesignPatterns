---
sidebar_position: 10
---

# Granular Imports by Category

In addition to the barrel (import from root), each pattern can be imported by its category path. **This doesn't add new symbols** — they're the same ones reexported from `/decorators`, `/operators`, `/pipe`, `/run`, and `/policy`.

## By pattern category

Each GoF pattern can be imported from its category:

```ts
// Creational
import { Singleton } from 'annotations-design-patterns/creational/singleton';
import { Factory, RegisterIn } from 'annotations-design-patterns/creational/factory';
import { builderFor } from 'annotations-design-patterns/creational/builder';

// Structural
import { Adapt } from 'annotations-design-patterns/structural/adapt';
import { Decorate, Intercept } from 'annotations-design-patterns/structural/decorate';
import { Frozen, Sealed } from 'annotations-design-patterns/structural/frozen';

// Behavioral
import { Subject, Emits } from 'annotations-design-patterns/behavioral/observer';
import { StateMachine, When, TransitionTo } from 'annotations-design-patterns/behavioral/state-machine';
import { CommandHistory, Revertible } from 'annotations-design-patterns/behavioral/command';
```

## Stable decorators facade

For resilience, there's a stable facade at `/decorators`:

```ts
import {
  Retry,
  Timeout,
  CircuitBreaker,
  Fallback,
  Memoize,
  CachedFor,
  Semaphore,
  Mutex,
} from 'annotations-design-patterns/decorators';
```

This facade **does not include** GoF decorators (Singleton, Factory, etc.) or internal TC39 adapters.

## Functional API: explicit subpaths

The functional API uses explicit subpaths, not granular categories:

```ts
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
import { retry, fallback, timeout } from 'annotations-design-patterns/operators';
import { definePolicy } from 'annotations-design-patterns/policy';
```

## Bundle optimization

With a modern bundler (Vite, esbuild, webpack 5+), **you don't need granular imports to optimize**. The barrels are already tree-shakeable:

```ts
// Equivalent in bundle (both fit equally small):

// Granular import
import { Singleton } from 'annotations-design-patterns/creational/singleton';

// Barrel import
import { Singleton } from 'annotations-design-patterns';
```

Use granular imports if you prefer **explicit clarity** in your imports, not for optimization.

## Internal location (not public)

**Don't import** from paths like:

```ts
// ❌ Not these, they're internal
import { Operator } from 'annotations-design-patterns/core/operator';
import { ObserverEvents } from 'annotations-design-patterns/core/events';
```

The `/core` directory contains implementation types not reexported publicly. Any symbol you need from those paths is available from the public subpaths.

## For reference of all public symbols

See the [Root Reference](/docs/api/root) for the complete barrel, or the specific references:

- [Decorators](/docs/api/decorators) — Resilience facade
- [Operators](/docs/api/operators) — Functional API
- [Pipe](/docs/api/pipe) — Composition with pipe
- [Run](/docs/api/run) — Execution with context
- [Policy](/docs/api/policy) — Reusable policies
- [Store](/docs/api/store) — Async store
- [Node](/docs/api/node) — Node.js context
- [Observability](/docs/api/observability) — Errors and events
- [Experimental](/docs/api/experimental) — Experimental APIs
