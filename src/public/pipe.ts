import type { AnyMethod, Operator } from './types';
import { composeOperators } from '../operators/compose';

export function pipe<This, Args extends readonly unknown[], Result>(
  method: AnyMethod<This, Args, Result>,
  ...operators: ReadonlyArray<Operator<This, Args, Result, Result>>
): AnyMethod<This, Args, Result> {
  return composeOperators(method, ...operators);
}
