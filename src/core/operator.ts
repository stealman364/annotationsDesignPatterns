import type { AnyMethod } from './types';

export interface Operator<This, Args extends readonly unknown[], Input, Output> {
  readonly name: string;
  apply(next: AnyMethod<This, Args, Input>): AnyMethod<This, Args, Output>;
}

export type { MaybePromise } from './types';
