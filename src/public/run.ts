import { createOperationContext } from '../core/context';
import { invoke, invokeWithContext } from '../core/invocation';
import type { EventSink } from '../observability';
import type { AnyMethod, MaybePromise } from './types';

export interface RunOptions {
  readonly operationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly eventSink?: EventSink;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export function run<This, Args extends readonly unknown[], Result>(
  receiver: This,
  args: Args,
  method: AnyMethod<This, Args, Result>,
  options?: RunOptions,
): MaybePromise<Result> {
  if (options === undefined) {
    return invoke(receiver, args, method);
  }

  return invokeWithContext(receiver, args, method, createOperationContext(receiver, args, options));
}
