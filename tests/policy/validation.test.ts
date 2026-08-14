import { describe, expect, it } from 'vitest';
import { InvalidPolicyError, validatePolicyConfig } from '../../src/policy/validation';
import type { PolicyConfig } from '../../src/policy/types';

type Args = readonly [id: string];

function expectInvalid(config: unknown, path: string): void {
  try {
    validatePolicyConfig(config);
    throw new Error('Expected validatePolicyConfig to reject the policy');
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidPolicyError);
    expect(error).toMatchObject({ code: 'INVALID_POLICY', path });
  }
}

describe('validatePolicyConfig', () => {
  it('rejects retry attempts below one at policy construction time', () => {
    expectInvalid({ retry: { attempts: 0, idempotent: true } }, 'retry.attempts');
  });

  it('rejects a timeout that is not strictly positive', () => {
    expectInvalid({ timeout: { ms: 0 } }, 'timeout.ms');
  });

  it('requires retry idempotency to be declared explicitly', () => {
    expectInvalid({ retry: { attempts: 2 } }, 'retry.idempotent');
  });

  it('requires an abort signal for a global timeout composed with retry', () => {
    expectInvalid(
      {
        retry: { attempts: 2, idempotent: true },
        timeout: { ms: 100, scope: 'global' },
      },
      'timeout.abortSignal',
    );
  });

  it('rejects an unknown custom order entry with an actionable path', () => {
    expectInvalid(
      {
        order: ['fallback', 'unknown-layer', 'retry', 'timeout'],
      },
      'order[1]',
    );
  });

  it('accepts a safe, fully declared policy', () => {
    const config = {
      fallback: { value: 'recovered' },
      circuitBreaker: { failures: 2, resetMs: 1_000 },
      retry: { attempts: 3, idempotent: true },
      timeout: { ms: 100, scope: 'perAttempt' },
    } as const satisfies PolicyConfig<Args, string>;

    expect(validatePolicyConfig(config)).toBeUndefined();
  });
});
