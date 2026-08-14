import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
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
      const useFallback = (error: unknown): MaybePromise<Result> => {
        emitPolicyEvent(context, 'fallback', 'fallback.used', { error });
        return resolve(error, args);
      };

      try {
        const result = next.call(this, context, ...args);
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
