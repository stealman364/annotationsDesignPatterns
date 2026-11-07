import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { isCallerCancellation } from '../core/cancellation';
import type { InvocationInfo } from '../core/invocation-info';
import type { ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

export type OperationOutcome = 'success' | 'error' | 'cancelled';

export interface OperationObservation<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly outcome: OperationOutcome;
  readonly durationMs: number;
  readonly invocation?: InvocationInfo<This, Args>;
}

export interface ObserveOperationOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly onComplete: (observation: OperationObservation<This, Args>) => unknown;
  /** Include receiver, arguments, operation id and metadata only when explicitly enabled. */
  readonly includeInvocation?: boolean;
}

function invokeWithObservedSignal<Result>(
  invoke: () => MaybePromise<Result>,
  signal: AbortSignal | undefined,
): MaybePromise<Result> {
  if (signal?.aborted === true) return Promise.reject(signal.reason);
  const value = invoke();
  if (signal === undefined) return value;

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return signal.aborted ? Promise.reject(signal.reason) : value;
  }

  let then: unknown;
  try {
    then = (value as PromiseLike<Result>).then;
  } catch (error) {
    return Promise.reject(signal.aborted ? signal.reason : error);
  }
  if (typeof then !== 'function') return signal.aborted ? Promise.reject(signal.reason) : value;

  const operation = new Promise<Result>((resolve, reject) => {
    queueMicrotask(() => {
      try {
        Reflect.apply(then, value, [resolve, reject]);
      } catch (error) {
        reject(error);
      }
    });
  });
  if (signal.aborted) {
    void operation.catch(() => undefined);
    return Promise.reject(signal.reason);
  }

  return new Promise<Result>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    void operation.then(
      (result) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(signal.reason);
        else resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(signal.reason);
        else reject(error);
      },
    );
  });
}

function safelyReport(
  callback: (observation: OperationObservation) => unknown,
  observation: OperationObservation,
): void {
  let result: unknown;
  try {
    result = callback(observation);
  } catch {
    return;
  }

  try {
    if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // A rejecting thenable is still only an observer failure.
  }
}

function createInvocationInfo<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
): InvocationInfo<This, Args> {
  return Object.freeze({
    receiver: context?.receiver ?? receiver,
    args: context?.args ?? (Object.freeze([...args]) as unknown as Args),
    ...(context?.key === undefined ? {} : { key: context.key }),
    ...(context?.operationId === undefined ? {} : { operationId: context.operationId }),
    metadata: context?.metadata ?? Object.freeze({}),
  });
}

function observeValue<This, Args extends readonly unknown[], Result>(
  value: MaybePromise<Result>,
  startedAt: number,
  context: RuntimeOperationContext<This, Args> | undefined,
  report: (observation: OperationObservation<This, Args>) => void,
): MaybePromise<Result> {
  const finish = (failed: boolean, error?: unknown): void => {
    report({
      outcome: !failed ? 'success' : isCallerCancellation(error, context) ? 'cancelled' : 'error',
      durationMs: Math.max(0, performance.now() - startedAt),
    });
  };

  if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
    if (value instanceof Promise) {
      try {
        void Promise.prototype.then.call(
          value,
          () => finish(false),
          (error: unknown) => finish(true, error),
        );
      } catch {
        // Do not alter a business promise if a customized promise species rejects observation.
      }
      return value;
    }

    // Thenables are assimilated once into a wrapper promise; returning the original could make
    // the caller assimilate a stateful thenable a second time.
    let then: unknown;
    let operation: Promise<Result>;
    try {
      then = (value as PromiseLike<Result>).then;
      if (typeof then !== 'function') {
        finish(false);
        return value;
      }
      operation = new Promise<Result>((resolve, reject) => {
        queueMicrotask(() => {
          try {
            Reflect.apply(then as (...args: unknown[]) => unknown, value, [resolve, reject]);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      operation = Promise.reject(error);
    }
    const observed = operation.then(
      (result) => {
        finish(false);
        return result as Result;
      },
      (error: unknown) => {
        finish(true, error);
        throw error;
      },
    );
    return observed;
  }

  finish(false);
  return value;
}

/**
 * Measures the outcome visible to this operator layer with a monotonic clock.
 * A contextual pre-abort is measured as cancellation; `run()` may short-circuit before
 * entering an operator when its signal was already aborted, in which case no layer ran.
 *
 * Native promises retain their identity when there is no signal. Generic thenables are
 * assimilated once and returned as a promise so observation cannot trigger a second
 * invocation of a stateful `then` method. Cancellation measures this waiter's outcome,
 * not necessarily completion of shared physical work.
 * A hostile Promise subclass whose species throws may prevent attaching an observer;
 * the original business promise is still returned unchanged.
 */
export function observeOperation<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
>(options: ObserveOperationOptions<This, Args>): Operator<This, Args, Result, Result> {
  const onComplete = options.onComplete;
  if (typeof onComplete !== 'function') throw new TypeError('observeOperation requires onComplete');
  const includeInvocation = options.includeInvocation === true;

  const observe = (
    receiver: This,
    args: Args,
    context: RuntimeOperationContext<This, Args> | undefined,
    invoke: () => MaybePromise<Result>,
  ): MaybePromise<Result> => {
    const startedAt = performance.now();
    const invocation = includeInvocation
      ? createInvocationInfo(receiver, args, context)
      : undefined;
    const report = (observation: OperationObservation<This, Args>): void => {
      const fixed = Object.freeze({
        ...observation,
        ...(invocation === undefined ? {} : { invocation }),
      });
      safelyReport(onComplete as (observation: OperationObservation) => unknown, fixed);
    };

    try {
      const result = invokeWithObservedSignal(invoke, context?.signal);
      return observeValue(result, startedAt, context, report);
    } catch (error) {
      const failure = context?.signal?.aborted === true ? context.signal.reason : error;
      report({
        outcome: isCallerCancellation(failure, context) ? 'cancelled' : 'error',
        durationMs: Math.max(0, performance.now() - startedAt),
      });
      throw failure;
    }
  };

  const apply = (next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> =>
    function (this: This, ...args: Args): MaybePromise<Result> {
      return observe(this, args, undefined, () => next.call(this, ...args));
    };

  const applyWithContext = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      return observe(this, args, context, () => next.call(this, context, ...args));
    };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'observeOperation',
    apply,
    applyWithContext,
  };
  return operator;
}
