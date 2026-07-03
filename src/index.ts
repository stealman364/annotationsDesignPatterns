export const LIB_NAME = 'annotations-design-patterns';

export { Singleton } from './patterns/singleton';
export { Memoize } from './patterns/memoize';
export { Frozen } from './patterns/frozen';
export { Debounce } from './patterns/debounce';
export { Throttle } from './patterns/throttle';
export { Retry, type RetryOptions } from './patterns/retry';
export { Lazy } from './patterns/lazy';
export { Emits, Subject, type Listener } from './patterns/observer';
export { Factory, RegisterIn } from './patterns/factory';
export { builderFor, type Builder } from './patterns/builder';
export { Intercept, type Interceptor, type Invocation } from './patterns/intercept';
export { StrategyFor, StrategySelector } from './patterns/strategy';
export { CommandHistory, Revertible, type Command } from './patterns/command';
export { Decorate, type MethodWrapper } from './patterns/decorate';
export { Adapt, type Adapted } from './patterns/adapt';
