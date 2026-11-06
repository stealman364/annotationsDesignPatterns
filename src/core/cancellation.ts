import type { RuntimeOperationContext } from './context';
import type { MaybePromise } from './types';

// Symbols survive independently bundled CJS entrypoints without a global registry.
const callerSignalKey = Symbol.for('annotations-design-patterns.caller-signal');
type SignalContext = { readonly signal?: AbortSignal; readonly [callerSignalKey]?: AbortSignal };

export function callerSignal(context: SignalContext | undefined): AbortSignal | undefined {
  return context !== undefined && callerSignalKey in context
    ? context[callerSignalKey]
    : context?.signal;
}

/** Only the actual caller signal/reason is cancellation, never an error name. */
export function isCallerCancellation(error: unknown, context: SignalContext | undefined): boolean {
  const signal = callerSignal(context);
  return signal?.aborted === true && Object.is(error, signal.reason);
}

export function withExecutionSignal<This, Args extends readonly unknown[]>(
  context: RuntimeOperationContext<This, Args>,
  signal: AbortSignal,
): RuntimeOperationContext<This, Args> {
  return Object.freeze({ ...context, signal, [callerSignalKey]: callerSignal(context) });
}

/** Shared work has no owner signal. Each consumer waits with its own signal. */
export function sharedContext<This, Args extends readonly unknown[]>(
  context: RuntimeOperationContext<This, Args> | undefined,
): RuntimeOperationContext<This, Args> | undefined {
  return context === undefined
    ? undefined
    : Object.freeze({ ...context, signal: undefined, [callerSignalKey]: undefined });
}

/** Check both sides of synchronous user code, including abort followed by throw. */
export function invokeWithSignal<Result>(
  invoke: () => MaybePromise<Result>,
  signal: AbortSignal | undefined,
): MaybePromise<Result> {
  if (signal?.aborted === true) return Promise.reject(signal.reason);
  try {
    return raceWithSignal(invoke(), signal);
  } catch (error) {
    if (signal !== undefined && Boolean(signal.aborted)) return Promise.reject(signal.reason);
    throw error;
  }
}

/** Preserve synchronous results and promise identity when there is no signal. */
export function raceWithSignal<Result>(
  value: MaybePromise<Result>,
  signal: AbortSignal | undefined,
): MaybePromise<Result> {
  if (signal === undefined) return value;
  // Assimilate even after abort so a late rejected value is always observed.
  let asynchronous: boolean;
  try {
    asynchronous =
      value !== null &&
      (typeof value === 'object' || typeof value === 'function') &&
      typeof (value as PromiseLike<Result>).then === 'function';
  } catch {
    asynchronous = true;
  }
  if (!asynchronous) return signal.aborted ? Promise.reject(signal.reason) : value;
  const operation = Promise.resolve(value);
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
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}
