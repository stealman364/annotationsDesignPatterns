export const LIB_NAME = 'annotations-design-patterns';

// Creacionales
export { Singleton } from './patterns/creational/singleton';
export { Factory, RegisterIn } from './patterns/creational/factory';
export { builderFor, type Builder } from './patterns/creational/builder';
export { Cloneable, type WithClone } from './patterns/creational/cloneable';

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

// Utilitarios de método
export { Memoize } from './patterns/utility/memoize';
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
