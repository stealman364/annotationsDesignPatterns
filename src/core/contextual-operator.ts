import type { ContextualMethod } from './context';
import type { Operator } from './operator';
import type { AnyMethod } from './types';

/** Internal extension used by built-in operators to receive run context. */
export interface ContextualOperator<
  This,
  Args extends readonly unknown[],
  Input,
  Output,
> extends Operator<This, Args, Input, Output> {
  applyWithContext(next: ContextualMethod<This, Args, Input>): ContextualMethod<This, Args, Output>;
}

export function isContextualOperator<This, Args extends readonly unknown[], Input, Output>(
  operator: Operator<This, Args, Input, Output>,
): operator is ContextualOperator<This, Args, Input, Output> {
  return 'applyWithContext' in operator && typeof operator.applyWithContext === 'function';
}

export function withoutContext<This, Args extends readonly unknown[], Result>(
  method: ContextualMethod<This, Args, Result>,
): AnyMethod<This, Args, Result> {
  return function (this: This, ...args: Args): ReturnType<ContextualMethod<This, Args, Result>> {
    return method.call(this, undefined, ...args);
  };
}
