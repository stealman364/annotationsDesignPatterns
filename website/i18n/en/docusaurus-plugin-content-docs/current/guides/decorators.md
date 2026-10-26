---
sidebar_position: 1
---

# GoF and Resilience Decorators

This guide covers the 14 classic GoF patterns (creational, structural, behavioral) plus the complete resilience kit (Retry, Timeout, Fallback, CircuitBreaker, and more) — all as simple decorators on your methods.

## Creational

| Pattern | What it does | Example |
|---------|----------|---------|
| `@Singleton` | Single instance, isolated by constructor | `@Singleton class Api {}` |
| `Factory<T>` + `@RegisterIn` | Constructor registry by key | `shapes.create('circle', 5)` |
| `builderFor(Class)` | Fluent builder with types | `builderFor(User).withName('Ana').build()` |
| `@Cloneable` | Shallow copy via `clone()` | `user.clone()` |

## Structural

| Pattern | What it does | Example |
|---------|----------|---------|
| `@Adapt` | Exposes methods under new names | `@Adapt({ alias: 'oldName' })` |
| `@Decorate` | Wraps the method (stackable) | `@Decorate(wrapper)` |
| `@Intercept` | Proxy: observes and modifies each call | `@Intercept(interceptor)` |
| `@Flyweight` | Shares instances by arguments | `@Flyweight class Icon {}` |
| `@Frozen` / `@Sealed` | Freezes or seals instances | `@Frozen class Config {}` |

## Behavioral

| Pattern | What it does | Example |
|---------|----------|---------|
| `Subject<Events>` + `@Emits` | Typed observer with events | `service.on('created', user => ...)` |
| `StrategySelector<S>` + `@StrategyFor` | Swappable strategy | `selector.use('fast')` |
| `CommandHistory` + `@Revertible` | Command with undo | `history.undo()` |
| `StateMachine<S>` + `@When` + `@TransitionTo` | State with guards | `@When('draft') @TransitionTo('review')` |

## Resilience kit

### Basic

- **`@Fallback(value | fn)`** — Value or function fallback if method fails.
- **`@Retry({ attempts, delayMs?, backoffFactor? })`** — Retries with exponential backoff.
- **`@Timeout(ms)`** — Rejects if it exceeds the limit (does not cancel the work).
- **`@CircuitBreaker({ failures, resetMs })`** — Breaks after failures; half-open after reset.

### Frequency control

- **`@Debounce(ms)`** — Waits before executing.
- **`@Throttle(ms)`** — Maximum one execution per window.
- **`@RateLimit(n, windowMs)`** — Maximum N executions per window.

### Isolation

- **`@Semaphore(n)`** — Maximum N concurrent executions.
- **`@Mutex`** — Mutual exclusion (= `@Semaphore(1)`).

### Cache and observability

- **`@Memoize`** — Cache by arguments and instance.
- **`@MemoizeByRef`** — Cache by identity (trie of `WeakMap`).
- **`@CachedFor(ttlMs, { key? })`** — Memoize with expiration.
- **`@Once` / `@Lazy`** — Execute once / computed getter.
- **`@Log` / `@Measure`** — Logs or measures (support Promises).

## Complete example: resilience stack

```ts
import { Singleton, Fallback, Retry, Timeout, CircuitBreaker } from 'annotations-design-patterns';

@Singleton
class UserService {
  @CircuitBreaker({ failures: 5, resetMs: 30_000 })
  @Timeout(5000)
  @Retry({ attempts: 3, delayMs: 100, backoffFactor: 2 })
  @Fallback<User[]>([])
  async getUsers(): Promise<User[]> {
    return fetch('https://api.example.com/users').then(r => r.json());
  }
}

const service = new UserService();
const users = await service.getUsers(); // fallback if it fails
```

The stack executes **bottom-up**: first Fallback (outermost), then Retry, Timeout, CircuitBreaker, and the method at the center. The fallback returns when the entire chain fails.

## Composition with `@Decorate` and `@Intercept`

For cross-cutting concerns that don't fit into resilience, use **`@Decorate`** (wraps the result) or **`@Intercept`** (before/after/modify the call):

```ts
const withLogging = (original: (...args: any[]) => any) => 
  async (...args: any[]) => {
    console.log('Call:', args);
    const result = await original(...args);
    console.log('Result:', result);
    return result;
  };

class Service {
  @Decorate(withLogging)
  async process(id: string): Promise<string> {
    return id.toUpperCase();
  }
}
```

## For complete details

See the [Decorators Reference](/docs/api/decorators) for exact signatures, finite numeric options (`attempts ≥ 1`, `delayMs ≥ 0`), and behavior with inheritance.
