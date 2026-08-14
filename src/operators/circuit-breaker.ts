import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { AnyMethod, MaybePromise } from '../core/types';

export interface CircuitBreakerOptions {
  readonly failures: number;
  readonly resetMs: number;
}

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | undefined;
  halfOpenProbeInFlight: boolean;
}

interface NormalizedCircuitBreakerOptions {
  readonly failures: number;
  readonly resetMs: number;
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

export function normalizeCircuitBreakerOptions({
  failures,
  resetMs,
}: CircuitBreakerOptions): NormalizedCircuitBreakerOptions {
  if (!Number.isFinite(failures) || failures < 1) {
    throw new RangeError('@CircuitBreaker requiere al menos 1 fallo para abrir el circuito');
  }
  if (!Number.isFinite(resetMs) || resetMs <= 0) {
    throw new RangeError('@CircuitBreaker requiere un resetMs mayor que 0');
  }
  return { failures, resetMs };
}

export function validateCircuitBreakerOptions(options: CircuitBreakerOptions): void {
  normalizeCircuitBreakerOptions(options);
}

export function circuitBreaker<This, Args extends readonly unknown[], Result>(
  options: CircuitBreakerOptions,
  createOpenError: () => Error = () => new CircuitBreakerOpenError(),
): Operator<This, Args, Result, Result> {
  const normalizedOptions = normalizeCircuitBreakerOptions(options);
  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const state: BreakerState = {
      consecutiveFailures: 0,
      openedAt: undefined,
      halfOpenProbeInFlight: false,
    };

    return function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      let isHalfOpenProbe = false;
      if (state.openedAt !== undefined) {
        if (
          Date.now() - state.openedAt < normalizedOptions.resetMs ||
          state.halfOpenProbeInFlight
        ) {
          return Promise.reject(createOpenError());
        }
        state.halfOpenProbeInFlight = true;
        isHalfOpenProbe = true;
        emitPolicyEvent(context, 'circuitBreaker', 'circuit.half_open', {});
      }

      const recover = (result: Result): Result => {
        if (isHalfOpenProbe || state.openedAt === undefined) {
          state.consecutiveFailures = 0;
          state.openedAt = undefined;
          state.halfOpenProbeInFlight = false;
          if (isHalfOpenProbe) {
            emitPolicyEvent(context, 'circuitBreaker', 'circuit.closed', {});
          }
        }
        return result;
      };
      const fail = (error: unknown): Promise<never> => {
        let opened = false;
        if (isHalfOpenProbe) {
          state.consecutiveFailures = normalizedOptions.failures;
          state.openedAt = Date.now();
          state.halfOpenProbeInFlight = false;
          opened = true;
        } else if (state.openedAt === undefined) {
          state.consecutiveFailures += 1;
          if (state.consecutiveFailures >= normalizedOptions.failures) {
            state.openedAt = Date.now();
            opened = true;
          }
        }
        if (opened) {
          emitPolicyEvent(context, 'circuitBreaker', 'circuit.open', {});
        }
        return Promise.reject(error);
      };

      try {
        const result = next.call(this, context, ...args);
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
