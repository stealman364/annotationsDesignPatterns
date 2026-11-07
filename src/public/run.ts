import { createOperationContext } from '../core/context';
import { invokeWithSignal } from '../core/cancellation';
import { invoke, invokeWithContext, registerContextualMethod } from '../core/invocation';
import type { InvocationInfo } from '../core/invocation-info';
import type { EventSink } from '../observability';
import type { AnyMethod, MaybePromise } from './types';

export interface RunOptions {
  readonly operationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly eventSink?: EventSink;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export interface ExecutionInfo<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> extends InvocationInfo<This, Args> {
  /** The effective signal for this execution layer; absent on ordinary direct calls. */
  readonly signal?: AbortSignal;
}

/**
 * Supplies explicit readonly execution data without ambient context. Context is
 * propagated by pipe/run; ordinary operator.apply() and opaque wrappers remain
 * context boundaries. Direct invocation preserves the callback's exact return.
 */
export function executionMethod<This, Args extends readonly unknown[], Return>(
  method: (this: This, execution: ExecutionInfo<This, Args>, ...args: Args) => Return,
): (this: This, ...args: Args) => Return {
  const invokeMethod = function (
    this: This,
    context: import('../core/context').RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): Return {
    const execution: ExecutionInfo<This, Args> = Object.freeze({
      receiver: this,
      args: Object.freeze([...args]) as unknown as Readonly<Args>,
      key: context?.key,
      signal: context?.signal,
      operationId: context?.operationId,
      metadata: Object.freeze({ ...context?.metadata }),
    });
    return method.call(this, execution, ...args);
  };
  const plain = function (this: This, ...args: Args): Return {
    return invokeMethod.call(this, undefined, ...args);
  };
  registerContextualMethod<This, Args, Return>(plain, invokeMethod);
  return plain;
}

/**
 * Invoca un método con contexto de operación: operationId, metadata, observabilidad
 * de eventos y señal de aborto. Sin opciones, es una invocación directa.
 *
 * @param receiver instancia sobre la que invocar el método.
 * @param args argumentos del método.
 * @param method función a invocar.
 * @param options contexto de ejecución (operationId, metadata, observabilidad, cancelación).
 * @returns resultado del método o su promesa.
 *
 * @example
 * ```ts
 * const service = new UserService();
 * const user = await run(
 *   service,
 *   ['123'],
 *   service.fetchUser,
 *   {
 *     operationId: 'fetch-user-x',
 *     metadata: { userId: '123' },
 *     eventSink: logger,
 *   },
 * );
 * ```
 */
export function run<This, Args extends readonly unknown[], Result>(
  receiver: This,
  args: Args,
  method: AnyMethod<This, Args, Result>,
  options?: RunOptions,
): MaybePromise<Result> {
  if (options === undefined) {
    return invoke(receiver, args, method);
  }

  const context = createOperationContext(receiver, args, options);
  return invokeWithSignal(() => invokeWithContext(receiver, args, method, context), options.signal);
}
