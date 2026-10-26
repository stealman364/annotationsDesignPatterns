import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { AnyMethod } from '../core/types';

export class TimeoutError extends PolicyError {
  constructor(
    milliseconds: number,
    message = `Operation timed out after ${milliseconds} ms`,
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'TIMEOUT' });
    this.name = 'TimeoutError';
  }
}

export interface TimeoutOptions {
  /**
   * Optional signal combined with an invocation signal. A timeout aborts the
   * derived signal, allowing contextual inner operators to stop follow-up work.
   */
  readonly signal?: AbortSignal;
}

interface AbortScope {
  readonly signal: AbortSignal;
  abort(reason: unknown): void;
  dispose(): void;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason === undefined ? new Error('Operation aborted') : signal.reason;
}

function createAbortScope(signals: readonly (AbortSignal | undefined)[]): AbortScope {
  const controller = new AbortController();
  const listeners: Array<{ readonly signal: AbortSignal; readonly listener: () => void }> = [];
  const abort = (reason: unknown): void => {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  };

  for (const signal of signals) {
    if (signal === undefined) {
      continue;
    }
    if (signal.aborted) {
      abort(abortReason(signal));
      break;
    }
    const listener = (): void => abort(abortReason(signal));
    signal.addEventListener('abort', listener, { once: true });
    listeners.push({ signal, listener });
  }

  return {
    signal: controller.signal,
    abort,
    dispose(): void {
      for (const { signal, listener } of listeners) {
        signal.removeEventListener('abort', listener);
      }
    },
  };
}

/**
 * Operador de límite de tiempo: si el método no resuelve en `milliseconds` ms,
 * rechaza con error. El método original sigue ejecutándose, pero su resultado
 * se descarta. Personalizable con `createTimeoutError` y cancelable con `signal`.
 *
 * @param milliseconds límite de tiempo en milisegundos.
 * @param createTimeoutError personalizador del error lanzado al expirar el tiempo.
 * @param options señal opcional para cancelar el límite antes del vencimiento.
 * @returns operador que gestiona el límite de tiempo.
 */
export function timeout<This, Args extends readonly unknown[], Result>(
  milliseconds: number,
  createTimeoutError: () => Error = () => new TimeoutError(milliseconds),
  options: TimeoutOptions = {},
): Operator<This, Args, Result, Result> {
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): Promise<Result> {
      const abortScope = createAbortScope([context?.signal, options.signal]);
      if (abortScope.signal.aborted) {
        const error = abortReason(abortScope.signal);
        abortScope.dispose();
        return Promise.reject(error);
      }

      const timeoutContext =
        context === undefined
          ? undefined
          : Object.freeze({ ...context, signal: abortScope.signal });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;
      const cleanup = (): void => {
        clearTimeout(timer);
        if (onAbort !== undefined) {
          abortScope.signal.removeEventListener('abort', onAbort);
        }
        abortScope.dispose();
      };
      const limit = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = createTimeoutError();
          emitPolicyEvent(context, 'timeout', 'timeout.triggered', { timeoutMs: milliseconds });
          abortScope.abort(error);
          reject(error);
        }, milliseconds);
      });
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = (): void => reject(abortReason(abortScope.signal));
        abortScope.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        const operation = Promise.resolve(next.call(this, timeoutContext, ...args));
        return Promise.race([operation, limit, aborted]).finally(cleanup);
      } catch (error) {
        cleanup();
        return Promise.reject(error);
      }
    };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'timeout',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createWrapper(function (this: This, _context, ...args: Args) {
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
