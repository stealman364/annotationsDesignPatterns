export const LIB_NAME = 'annotations-design-patterns';

// Creacionales
export { Singleton } from './patterns/creational/singleton';
export { Factory, RegisterIn } from './patterns/creational/factory';
export { builderFor, type Builder } from './patterns/creational/builder';
export { Cloneable, type WithClone } from './patterns/creational/cloneable';
export {
  Container,
  Inject,
  Injectable,
  InjectionToken,
  type Scope,
  type Token,
} from './patterns/creational/injection';

// Estructurales
export { Adapt, type Adapted } from './patterns/structural/adapt';
export { Decorate, type MethodWrapper } from './patterns/structural/decorate';
export { Intercept, type Interceptor, type Invocation } from './patterns/structural/intercept';
export { Frozen } from './patterns/structural/frozen';
export { Flyweight } from './patterns/structural/flyweight';
export { Sealed } from './patterns/structural/sealed';

// De comportamiento
export { Emits, Subject, type Listener } from './patterns/behavioral/observer';
export { StrategyFor, StrategySelector } from './patterns/behavioral/strategy';
export { CommandHistory, Revertible, type Command } from './patterns/behavioral/command';
export { Snapshot, SnapshotHistory } from './patterns/behavioral/snapshot';
export { HandlerChain, HandlerFor, type Handler } from './patterns/behavioral/handler-chain';
export { IterableOver, type WithIterator } from './patterns/behavioral/iterable-over';
export { StateMachine, TransitionTo, When } from './patterns/behavioral/state-machine';

// Utilitarios de método
export { Memoize, type KeyResolver, type MemoizeOptions } from './patterns/utility/memoize';
export { MemoizeByRef } from './patterns/utility/memoize-by-ref';
export { Debounce } from './patterns/utility/debounce';
export { Throttle } from './patterns/utility/throttle';
export { Retry, type RetryOptions } from './patterns/utility/retry';
export { Lazy } from './patterns/utility/lazy';
export { Once } from './patterns/utility/once';
export { Deprecated } from './patterns/utility/deprecated';
export { Bind } from './patterns/utility/bind';
export { Timeout } from './patterns/utility/timeout';
export { RateLimit } from './patterns/utility/rate-limit';
export { CircuitBreaker, type CircuitBreakerOptions } from './patterns/utility/circuit-breaker';
export { CachedFor, type CachedForOptions } from './patterns/utility/cached-for';
export { Validate, type Guard } from './patterns/utility/validate';
export { Mutex } from './patterns/utility/mutex';
export { Fallback } from './patterns/utility/fallback';
export { Semaphore } from './patterns/utility/semaphore';
