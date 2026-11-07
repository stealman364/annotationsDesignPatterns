import { invokeWithSignal } from '../core/cancellation';
import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { isCount, isDuration } from '../core/numeric';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import { PolicyError } from '../core/errors';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';

const rateLimitErrorBrand = Symbol.for('annotations-design-patterns.rate-limit-exceeded');

export interface RateLimitOptions {
  /** Maximum number of admitted calls in each sliding window. */
  readonly limit: number;
  /** Sliding window duration in milliseconds. */
  readonly windowMs: number;
}

export class RateLimitExceededError extends PolicyError {
  readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super('Rate limit exceeded', { code: 'POLICY_ERROR' });
    this.name = 'RateLimitExceededError';
    this.retryAfterMs = retryAfterMs;
    Object.defineProperty(this, rateLimitErrorBrand, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }
}

type BrandedRateLimitError = { readonly [rateLimitErrorBrand]?: unknown };

/** Recognizes rate-limit failures across independently loaded ESM and CJS copies. */
export function isRateLimitExceededError(value: unknown): value is RateLimitExceededError {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return false;
  try {
    return (value as BrandedRateLimitError)[rateLimitErrorBrand] === true;
  } catch {
    return false;
  }
}

function createWrapper<This, Args extends readonly unknown[], Result>(
  next: ContextualMethod<This, Args, Result>,
  limit: number,
  windowMs: number,
): ContextualMethod<This, Args, Result> {
  let admissions: number[] = [];
  let head = 0;

  return function (
    this: This,
    context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ): MaybePromise<Result> {
    const signal = context?.signal;
    if (signal?.aborted === true) return Promise.reject(signal.reason);

    const now = performance.now();
    while (head < admissions.length && now - admissions[head]! >= windowMs) head += 1;

    if (head === admissions.length) {
      admissions = [];
      head = 0;
    } else if (head > 0 && head * 2 >= admissions.length) {
      admissions = admissions.slice(head);
      head = 0;
    }

    if (admissions.length - head >= limit) {
      const oldest = admissions[head]!;
      return Promise.reject(new RateLimitExceededError(Math.max(0, windowMs - (now - oldest))));
    }

    // Reserve before user code so synchronous reentrant calls observe this admission.
    admissions.push(now);
    return invokeWithSignal(() => next.call(this, context, ...args), signal);
  };
}

/** Creates a per-applied-method sliding-window admission operator. */
export function rateLimit<This, Args extends readonly unknown[], Result>(
  options: RateLimitOptions,
): Operator<This, Args, Result, Result> {
  const { limit, windowMs } = options;
  if (!isCount(limit, 1)) {
    throw new RangeError('rateLimit requires limit to be a positive safe integer');
  }
  if (!isDuration(windowMs, false)) {
    throw new RangeError('rateLimit requires windowMs to be a finite positive number');
  }

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'rateLimit',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const contextual = createWrapper(
        function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        },
        limit,
        windowMs,
      );
      return withoutContext(contextual);
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next, limit, windowMs);
    },
  };

  return operator;
}
