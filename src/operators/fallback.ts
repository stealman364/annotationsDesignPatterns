import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { callerSignal, invokeWithSignal, isCallerCancellation } from '../core/cancellation';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

type FallbackValue<Args extends readonly unknown[], Result> =
  Result | ((error: unknown, ...args: Args) => MaybePromise<Result>);

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<unknown>).then === 'function'
    );
  } catch {
    return true;
  }
}

/**
 * Operador de respaldo: si el método falla, devuelve un valor de respaldo
 * (directo o generado por una función que recibe el error y los argumentos).
 *
 * @param value respaldo directo o función `(error, ...args) => valor | Promise<valor>`.
 * @returns operador que proporciona el respaldo ante cualquier error.
 */
export function fallback<This, Args extends readonly unknown[], Result>(
  value: FallbackValue<Args, Result>,
): Operator<This, Args, Result, Result> {
  const resolve = (error: unknown, args: Args): MaybePromise<Result> =>
    typeof value === 'function'
      ? (value as (error: unknown, ...args: Args) => MaybePromise<Result>)(error, ...args)
      : value;
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      if (context?.signal?.aborted === true) return Promise.reject(context.signal.reason);
      const useFallback = (error: unknown): MaybePromise<Result> => {
        const signal = callerSignal(context);
        const failure = signal?.aborted === true ? signal.reason : error;
        if (isCallerCancellation(failure, context)) return Promise.reject(failure);
        emitPolicyEvent(context, 'fallback', 'fallback.used', { error });
        return invokeWithSignal(() => resolve(error, args), context?.signal);
      };

      try {
        const result = invokeWithSignal(() => next.call(this, context, ...args), context?.signal);
        return isPromiseLike(result)
          ? Promise.resolve(result).catch((error: unknown) => useFallback(error))
          : result;
      } catch (error) {
        return useFallback(error);
      }
    };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'fallback',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createWrapper(function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        }),
      );
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next);
    },
  };

  return operator;
}
