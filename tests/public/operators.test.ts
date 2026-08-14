import { describe, expect, expectTypeOf, it } from 'vitest';
import * as operators from '../../src/public/operators';
import type {
  CachedForOperatorOptions,
  CircuitBreakerOptions,
  MemoizeOperatorOptions,
  RetryOptions,
} from '../../src/public/operators';

describe('public operators', () => {
  it('exports the selected functional operators and typed policy errors', () => {
    expect(Object.keys(operators).sort()).toEqual([
      'CircuitBreakerOpenError',
      'KeyedLockQueueFullError',
      'OverlapDroppedError',
      'OverlapQueueFullError',
      'PolicyError',
      'TimeoutError',
      'cachedFor',
      'cachedForWithHandle',
      'circuitBreaker',
      'fallback',
      'isPolicyError',
      'keyedLock',
      'memoize',
      'memoizeWithHandle',
      'overlap',
      'retry',
      'timeout',
    ]);
    expect(new operators.TimeoutError(10)).toBeInstanceOf(Error);
    expect(new operators.CircuitBreakerOpenError()).toBeInstanceOf(Error);
    expect(operators.isPolicyError(new operators.PolicyError('policy failure'))).toBe(true);
  });

  it('exposes option types for the selected operators', () => {
    const retryOptions: RetryOptions = { attempts: 2 };
    const circuitBreakerOptions: CircuitBreakerOptions = { failures: 2, resetMs: 100 };
    const memoizeOptions: MemoizeOperatorOptions<readonly [id: string]> = {
      key: (id) => id,
    };
    const cachedForOptions: CachedForOperatorOptions<readonly [id: string]> = {
      key: (id) => id,
    };

    expectTypeOf(retryOptions).toEqualTypeOf<RetryOptions>();
    expectTypeOf(circuitBreakerOptions).toEqualTypeOf<CircuitBreakerOptions>();
    expectTypeOf(memoizeOptions).toEqualTypeOf<MemoizeOperatorOptions<readonly [id: string]>>();
    expectTypeOf(cachedForOptions).toEqualTypeOf<CachedForOperatorOptions<readonly [id: string]>>();
  });
});
