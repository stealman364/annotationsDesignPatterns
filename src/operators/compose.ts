import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { isContextualOperator, withoutContext } from '../core/contextual-operator';
import { invokeWithContext, registerContextualMethod } from '../core/invocation';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

export function composeOperators<This, Args extends readonly unknown[], Result>(
  method: AnyMethod<This, Args, Result>,
  ...operators: ReadonlyArray<Operator<This, Args, Result, Result>>
): AnyMethod<This, Args, Result> {
  return operators.reduceRight((next, operator) => {
    if (!isContextualOperator(operator)) {
      // Apply once so ordinary wrappers retain their closure state. An identity
      // preserves next's contextual companion. An opaque wrapper is a context
      // boundary for inner operators; it must support applyWithContext to pass
      // context through asynchronous work without ambient shared state.
      return operator.apply(next);
    }
    const contextualNext: ContextualMethod<This, Args, Result> = function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      return context === undefined
        ? next.call(this, ...args)
        : invokeWithContext(this, args, next, context);
    };
    const contextualComposed = operator.applyWithContext(contextualNext);
    return registerContextualMethod(withoutContext(contextualComposed), contextualComposed);
  }, method);
}
