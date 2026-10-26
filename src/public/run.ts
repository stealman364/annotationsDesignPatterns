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

  return invokeWithContext(receiver, args, method, createOperationContext(receiver, args, options));
}
