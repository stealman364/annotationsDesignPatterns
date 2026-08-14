export type MaybePromise<T> = T | PromiseLike<T>;

export type AnyMethod<This, Args extends readonly unknown[], Result> = (
  this: This,
  ...args: Args
) => MaybePromise<Result>;

export interface OperationContext<This, Args extends readonly unknown[]> {
  readonly receiver: This;
  readonly args: Args;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}
