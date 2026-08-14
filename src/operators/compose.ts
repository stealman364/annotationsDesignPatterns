import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import {
  isContextualOperator,
  withoutContext,
  type ContextualOperator,
} from '../core/contextual-operator';
import { registerContextualMethod } from '../core/invocation';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

export function composeOperators<This, Args extends readonly unknown[], Result>(
  method: AnyMethod<This, Args, Result>,
  ...operators: ReadonlyArray<Operator<This, Args, Result, Result>>
): AnyMethod<This, Args, Result> {
  const contextualOperators: Array<ContextualOperator<This, Args, Result, Result>> = [];

  for (const operator of operators) {
    if (!isContextualOperator(operator)) {
      return operators.reduceRight((next, current) => current.apply(next), method);
    }
    contextualOperators.push(operator);
  }

  const contextualBase: ContextualMethod<This, Args, Result> = function (
    this: This,
    _context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): MaybePromise<Result> {
    return method.call(this, ...args);
  };
  const contextualComposed = contextualOperators.reduceRight(
    (next, operator) => operator.applyWithContext(next),
    contextualBase,
  );

  return registerContextualMethod(withoutContext(contextualComposed), contextualComposed);
}
