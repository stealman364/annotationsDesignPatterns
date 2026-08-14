import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CircuitBreakerOpenError,
  isPolicyError,
  PolicyError,
  TimeoutError,
  type PolicyErrorCode,
} from '../src/public/operators';
import { CircuitBreakerOpenError as LegacyCircuitBreakerOpenError } from '../src/operators/circuit-breaker';
import { TimeoutError as LegacyTimeoutError } from '../src/operators/timeout';

const documentedCodes = [
  'POLICY_ERROR',
  'TIMEOUT',
  'RETRY_EXHAUSTED',
  'CIRCUIT_OPEN',
  'ABORTED',
  'INVALID_POLICY',
  'OVERLAP_DROPPED',
  'OVERLAP_QUEUE_FULL',
  'KEYED_LOCK_QUEUE_FULL',
  'DEPENDENCY_RESOLUTION',
  'CIRCULAR_DEPENDENCY',
] as const satisfies readonly PolicyErrorCode[];

function assertMetadataIsReadonly(error: TimeoutError): void {
  // @ts-expect-error Error metadata must not be writable from the public API.
  error.metadata.operationId = 'mutated';
}

describe('typed policy errors', () => {
  it('provides a PolicyError base class with the documented stable codes', () => {
    for (const code of documentedCodes) {
      const error = new PolicyError(`failure: ${code}`, { code });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PolicyError');
      expect(error.code).toBe(code);
      expect(isPolicyError(error)).toBe(true);
    }
  });

  it('preserves timeout cause, stable code, and readonly metadata', () => {
    const cause = new Error('upstream timed out');
    const metadata: Readonly<Record<string, unknown>> = {
      operationId: 'operation-42',
      operator: 'timeout',
    };
    const error = new TimeoutError(25, 'request timed out', { cause, metadata });

    expect(error).toBeInstanceOf(PolicyError);
    expect(error).toBeInstanceOf(LegacyTimeoutError);
    expect(error.name).toBe('TimeoutError');
    expect(error.message).toBe('request timed out');
    expect(error.code).toBe('TIMEOUT');
    expect(error.cause).toBe(cause);
    expect(error.metadata).toEqual(metadata);
    expectTypeOf(error.metadata).toMatchTypeOf<Readonly<Record<string, unknown>>>();

    void assertMetadataIsReadonly;
  });

  it('keeps the circuit breaker error nominally compatible while joining the hierarchy', () => {
    const error = new CircuitBreakerOpenError();

    expect(error).toBeInstanceOf(PolicyError);
    expect(error).toBeInstanceOf(LegacyCircuitBreakerOpenError);
    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.code).toBe('CIRCUIT_OPEN');
  });

  it('recognizes only instances of the policy error hierarchy', () => {
    expect(isPolicyError(new PolicyError('known policy error'))).toBe(true);
    expect(isPolicyError(new TimeoutError(10))).toBe(true);
    expect(isPolicyError(new CircuitBreakerOpenError())).toBe(true);
    expect(isPolicyError(new Error('user error'))).toBe(false);
    expect(isPolicyError({ name: 'PolicyError', code: 'TIMEOUT' })).toBe(false);
    expect(isPolicyError(null)).toBe(false);
  });
});
