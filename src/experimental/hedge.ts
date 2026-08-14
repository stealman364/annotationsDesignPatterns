import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

export interface HedgeOptions {
  readonly delayMs: number;
  readonly idempotent: true;
}

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

function assertOptions(options: HedgeOptions): void {
  if (options.idempotent !== true) {
    throw new TypeError('hedge requires idempotent: true');
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new RangeError('hedge requires a finite delayMs greater than or equal to 0');
  }
}

export function hedge<This, Args extends readonly unknown[], Result>(
  options: HedgeOptions,
): Operator<This, Args, Result, Result> {
  assertOptions(options);

  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      let primary: MaybePromise<Result> | undefined;
      let primaryFailedSynchronously = false;
      let primarySynchronousError: unknown;

      try {
        primary = next.call(this, context, ...args);
      } catch (error) {
        primaryFailedSynchronously = true;
        primarySynchronousError = error;
      }

      if (!primaryFailedSynchronously && !isPromiseLike(primary as MaybePromise<Result>)) {
        return primary as Result;
      }

      return new Promise<Result>((resolve, reject) => {
        let settled = false;
        let hedgeStarted = false;
        let primaryRejected = primaryFailedSynchronously;
        let hedgeRejected = false;
        let primaryError: unknown = primarySynchronousError;
        let hedgeError: unknown;

        const settle = (complete: (value: Result) => void, value: Result): void => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          complete(value);
        };
        const failIfExhausted = (): void => {
          if (!primaryRejected || !hedgeRejected) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          reject(hedgeError ?? primaryError);
        };
        const observe = (execution: MaybePromise<Result>, isPrimary: boolean): void => {
          Promise.resolve(execution).then(
            (value) => settle(resolve, value),
            (error: unknown) => {
              if (isPrimary) {
                primaryRejected = true;
                primaryError = error;
              } else {
                hedgeRejected = true;
                hedgeError = error;
              }
              failIfExhausted();
            },
          );
        };

        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
          if (settled || hedgeStarted) {
            return;
          }
          hedgeStarted = true;
          try {
            observe(next.call(this, context, ...args), false);
          } catch (error) {
            hedgeRejected = true;
            hedgeError = error;
            failIfExhausted();
          }
        }, options.delayMs);
        if (!primaryRejected) {
          observe(primary as MaybePromise<Result>, true);
        }
      });
    };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'hedge',
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
