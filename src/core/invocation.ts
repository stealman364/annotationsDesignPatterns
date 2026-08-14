import type { ContextualMethod, RuntimeOperationContext } from './context';
import type { AnyMethod, MaybePromise } from './types';

/**
 * `pipe` and `run` are separate CJS entrypoints, so a module-local WeakMap
 * would be duplicated by the bundler. A global symbol keeps the contextual
 * companion on the composed function itself without making it enumerable.
 */
const contextualMethodKey = Symbol.for('annotations-design-patterns.contextual-method');

type ContextualMethodCarrier = {
  readonly [key: symbol]: unknown;
};

export function invoke<This, Args extends readonly unknown[], Result>(
  receiver: This,
  args: Args,
  method: AnyMethod<This, Args, Result>,
): MaybePromise<Result> {
  return Reflect.apply(method, receiver, args);
}

/** Registers the private contextual form of a composed public method. */
export function registerContextualMethod<This, Args extends readonly unknown[], Result>(
  method: AnyMethod<This, Args, Result>,
  contextualMethod: ContextualMethod<This, Args, Result>,
): AnyMethod<This, Args, Result> {
  Object.defineProperty(method, contextualMethodKey, {
    configurable: false,
    enumerable: false,
    value: contextualMethod,
    writable: false,
  });
  return method;
}

export function invokeWithContext<This, Args extends readonly unknown[], Result>(
  receiver: This,
  args: Args,
  method: AnyMethod<This, Args, Result>,
  context: RuntimeOperationContext<This, Args>,
): MaybePromise<Result> {
  let candidate: unknown;
  try {
    candidate = (method as unknown as ContextualMethodCarrier)[contextualMethodKey];
  } catch {
    return invoke(receiver, args, method);
  }

  const contextualMethod =
    typeof candidate === 'function'
      ? (candidate as ContextualMethod<This, Args, Result>)
      : undefined;

  return contextualMethod === undefined
    ? invoke(receiver, args, method)
    : contextualMethod.call(receiver, context, ...args);
}
