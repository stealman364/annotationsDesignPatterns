import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

export interface RetryInvocationContext<This, Args extends readonly unknown[]> {
  readonly receiver: This;
  readonly args: Args;
  readonly operationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export interface RetryOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> {
  /** Número total de intentos, incluido el primero. Mínimo 1. */
  attempts: number;
  /** Espera antes del primer reintento en milisegundos. Por defecto 0. */
  delayMs?: number;
  /** Multiplicador del backoff exponencial. Por defecto 1. Mínimo 1. */
  backoffFactor?: number;
  shouldRetry?: (
    error: unknown,
    attempt: number,
    context: RetryInvocationContext<This, Args>,
  ) => boolean;
}

interface NormalizedRetryOptions<This, Args extends readonly unknown[]> {
  readonly attempts: number;
  readonly delayMs: number;
  readonly backoffFactor: number;
  readonly shouldRetry:
    | ((error: unknown, attempt: number, context: RetryInvocationContext<This, Args>) => boolean)
    | undefined;
}

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new Error('Retry aborted') : signal.reason;
}

function waitForRetry(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortReason(signal));
      return;
    }

    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(signal === undefined ? new Error('Retry aborted') : abortReason(signal));
    };
    const onTimeout = (): void => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer: ReturnType<typeof setTimeout> = setTimeout(onTimeout, delayMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

function assertFiniteNumberAtLeast(value: number, minimum: number, option: string): void {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`@Retry requiere ${option}`);
  }
}

export function normalizeRetryOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
>({
  attempts,
  delayMs = 0,
  backoffFactor = 1,
  shouldRetry,
}: RetryOptions<This, Args>): NormalizedRetryOptions<This, Args> {
  assertFiniteNumberAtLeast(attempts, 1, 'al menos 1 intento');
  assertFiniteNumberAtLeast(delayMs, 0, 'un delayMs finito mayor o igual que 0');
  assertFiniteNumberAtLeast(backoffFactor, 1, 'un backoffFactor finito mayor o igual que 1');
  if (shouldRetry !== undefined && typeof shouldRetry !== 'function') {
    throw new TypeError('@Retry requiere shouldRetry como funciÃ³n');
  }
  return { attempts, delayMs, backoffFactor, shouldRetry };
}

export function retry<This, Args extends readonly unknown[], Result>(
  options: RetryOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  const { attempts, delayMs, backoffFactor, shouldRetry } = normalizeRetryOptions(options);
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const retryArgs = context?.args ?? (Object.freeze([...args]) as unknown as Args);
      const retryMetadata = context?.metadata ?? emptyMetadata;

      const retryAfter = (error: unknown, attempt: number): MaybePromise<Result> => {
        if (context?.signal?.aborted === true) {
          return Promise.reject(abortReason(context.signal));
        }

        let mayRetry = attempt < attempts;
        if (mayRetry && shouldRetry !== undefined) {
          try {
            mayRetry = shouldRetry(error, attempt, {
              receiver: this,
              args: retryArgs,
              operationId: context?.operationId,
              metadata: retryMetadata,
              key: context?.key,
              signal: context?.signal,
            });
          } catch (decisionError) {
            return Promise.reject(decisionError);
          }
        }
        if (!mayRetry) {
          emitPolicyEvent(context, 'retry', 'retry.exhausted', { attempt, error });
          return Promise.reject(error);
        }
        const invokeNext = (): MaybePromise<Result> => invoke(attempt + 1);
        if (delayMs === 0) {
          return Promise.resolve().then(() => {
            if (context?.signal?.aborted === true) {
              throw abortReason(context.signal);
            }
            return invokeNext();
          });
        }
        const wait = delayMs * backoffFactor ** (attempt - 1);
        return waitForRetry(wait, context?.signal).then(invokeNext);
      };

      const invoke = (attempt: number): MaybePromise<Result> => {
        if (context?.signal?.aborted === true) {
          return Promise.reject(abortReason(context.signal));
        }
        emitPolicyEvent(context, 'retry', 'retry.attempt', { attempt });
        try {
          const result = next.call(this, context, ...args);
          return isPromiseLike(result)
            ? Promise.resolve(result).catch((error: unknown) => retryAfter(error, attempt))
            : result;
        } catch (error) {
          return retryAfter(error, attempt);
        }
      };

      return invoke(1);
    };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'retry',
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
