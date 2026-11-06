import { isCount, isDuration } from '../core/numeric';
import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { callerSignal, invokeWithSignal, isCallerCancellation } from '../core/cancellation';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { AnyMethod, MaybePromise } from '../core/types';
import type { InvocationInfo } from '../core/invocation-info';

export interface CircuitBreakerOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
> {
  readonly failures: number;
  readonly resetMs: number;
  /** A synchronous false result ignores the error without treating it as success. */
  readonly isFailure?: (error: unknown, info: InvocationInfo<This, Args>) => boolean;
}

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | undefined;
  halfOpenProbeInFlight: boolean;
  probeStartedAt: number | undefined;
  generation: number;
}

interface NormalizedCircuitBreakerOptions<This, Args extends readonly unknown[]> {
  readonly failures: number;
  readonly resetMs: number;
  readonly isFailure: ((error: unknown, info: InvocationInfo<This, Args>) => boolean) | undefined;
}

export class CircuitBreakerOpenError extends PolicyError {
  constructor(
    message = 'Circuito abierto: demasiados fallos consecutivos',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'CIRCUIT_OPEN' });
    this.name = 'CircuitBreakerOpenError';
  }
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

export function normalizeCircuitBreakerOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
>({
  failures,
  resetMs,
  isFailure,
}: CircuitBreakerOptions<This, Args>): NormalizedCircuitBreakerOptions<This, Args> {
  if (!isCount(failures, 1)) {
    throw new RangeError('@CircuitBreaker requiere al menos 1 fallo para abrir el circuito');
  }
  if (!isDuration(resetMs, false)) {
    throw new RangeError('@CircuitBreaker requiere un resetMs mayor que 0');
  }
  if (isFailure !== undefined && typeof isFailure !== 'function') {
    throw new TypeError('@CircuitBreaker requires isFailure to be a function');
  }
  return { failures, resetMs, isFailure };
}

export function validateCircuitBreakerOptions<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
>(options: CircuitBreakerOptions<This, Args>): void {
  normalizeCircuitBreakerOptions(options);
}

/**
 * Operador de disjuntor (circuit breaker): tras `failures` fallos
 * consecutivos, rechaza durante `resetMs` ms. Luego intenta con una llamada
 * de prueba; si tiene éxito, cierra el circuito; si falla, lo vuelve a abrir.
 *
 * @param options configuración con `failures` y `resetMs`.
 * @param createOpenError personalizador del error lanzado cuando el circuito está abierto.
 * @returns operador que gestiona el estado del circuito.
 */
export function circuitBreaker<This, Args extends readonly unknown[], Result>(
  options: CircuitBreakerOptions<This, Args>,
  createOpenError: () => Error = () => new CircuitBreakerOpenError(),
): Operator<This, Args, Result, Result> {
  const normalizedOptions = normalizeCircuitBreakerOptions(options);
  const isFailure = normalizedOptions.isFailure;
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const state: BreakerState = {
      consecutiveFailures: 0,
      openedAt: undefined,
      halfOpenProbeInFlight: false,
      probeStartedAt: undefined,
      generation: 0,
    };

    return function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const signal = callerSignal(context);
      if (signal?.aborted === true) return Promise.reject(signal.reason);
      let isHalfOpenProbe = false;
      let generation = state.generation;
      if (state.openedAt !== undefined) {
        const now = Date.now();
        if (
          now - state.openedAt < normalizedOptions.resetMs ||
          (state.halfOpenProbeInFlight &&
            now - (state.probeStartedAt ?? now) < normalizedOptions.resetMs)
        ) {
          return Promise.reject(createOpenError());
        }
        state.halfOpenProbeInFlight = true;
        state.probeStartedAt = now;
        generation = ++state.generation;
        isHalfOpenProbe = true;
        emitPolicyEvent(context, 'circuitBreaker', 'circuit.half_open', {});
      }

      const releaseUndecidedProbe = (): void => {
        if (isHalfOpenProbe && generation === state.generation) {
          state.halfOpenProbeInFlight = false;
          state.probeStartedAt = undefined;
          state.generation++;
        }
      };

      const recover = (result: Result): Result => {
        if (signal?.aborted === true) {
          releaseUndecidedProbe();
          throw signal.reason;
        }
        if (generation !== state.generation) return result;
        if (isHalfOpenProbe || state.openedAt === undefined) {
          state.consecutiveFailures = 0;
          state.openedAt = undefined;
          state.halfOpenProbeInFlight = false;
          state.probeStartedAt = undefined;
          if (isHalfOpenProbe) {
            state.generation++;
            emitPolicyEvent(context, 'circuitBreaker', 'circuit.closed', {});
          }
        }
        return result;
      };
      const fail = (error: unknown): Promise<never> => {
        const failure = signal?.aborted === true ? signal.reason : error;
        if (isCallerCancellation(failure, context)) {
          releaseUndecidedProbe();
          return Promise.reject(failure);
        }
        if (generation !== state.generation) return Promise.reject(error);
        if (isFailure !== undefined) {
          let decision: boolean;
          try {
            const info: InvocationInfo<This, Args> = Object.freeze({
              receiver: this,
              args: Object.freeze([...args]) as unknown as Readonly<Args>,
              key: context?.key,
              operationId: context?.operationId,
              metadata: Object.freeze({ ...context?.metadata }),
            });
            const classified: unknown = isFailure(error, info);
            if (typeof classified !== 'boolean') {
              // An accidentally async predicate may reject; observe that work
              // while rejecting its unsupported decision with a clear error.
              void Promise.resolve(classified).catch(() => undefined);
              throw new TypeError('CircuitBreaker isFailure must return a boolean synchronously');
            }
            decision = classified;
          } catch (decisionError) {
            releaseUndecidedProbe();
            return Promise.reject(signal?.aborted === true ? signal.reason : decisionError);
          }
          if (signal?.aborted === true) {
            releaseUndecidedProbe();
            return Promise.reject(signal.reason);
          }
          // Classification is user code and may reenter the breaker. Never
          // account an older decision against the state of a newer generation.
          if (generation !== state.generation) return Promise.reject(error);
          if (!decision) {
            releaseUndecidedProbe();
            return Promise.reject(error);
          }
        }
        let opened = false;
        if (isHalfOpenProbe) {
          state.consecutiveFailures = normalizedOptions.failures;
          state.openedAt = Date.now();
          state.halfOpenProbeInFlight = false;
          state.probeStartedAt = undefined;
          opened = true;
        } else if (state.openedAt === undefined) {
          state.consecutiveFailures += 1;
          if (state.consecutiveFailures >= normalizedOptions.failures) {
            state.openedAt = Date.now();
            opened = true;
          }
        }
        if (opened) {
          state.generation++;
          emitPolicyEvent(context, 'circuitBreaker', 'circuit.open', {});
        }
        return Promise.reject(error);
      };

      try {
        const result = invokeWithSignal(() => next.call(this, context, ...args), context?.signal);
        return isPromiseLike(result)
          ? Promise.resolve(result).then(recover, fail)
          : recover(result);
      } catch (error) {
        return fail(error);
      }
    };
  };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'circuitBreaker',
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
