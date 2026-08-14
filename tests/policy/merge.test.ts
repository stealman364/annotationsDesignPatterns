import { describe, expect, it } from 'vitest';
import { mergePolicyConfig } from '../../src/policy/merge';
import type { PolicyConfig } from '../../src/policy/types';

type Args = readonly [id: string];

describe('mergePolicyConfig', () => {
  it('deeply merges known policy layers while replacing arrays and preserving false', () => {
    const base = {
      fallback: { value: 'base fallback' },
      circuitBreaker: { failures: 4, resetMs: 500 },
      retry: {
        attempts: 3,
        delayMs: 10,
        backoffFactor: 2,
        idempotent: true,
      },
      timeout: { ms: 100, scope: 'perAttempt' },
      order: ['fallback', 'circuitBreaker', 'retry', 'timeout'],
    } as const satisfies PolicyConfig<Args, string>;
    const extension = {
      retry: { delayMs: 25 },
      timeout: false,
      order: ['fallback', 'retry', 'circuitBreaker', 'timeout'],
    } as const;

    const merged = mergePolicyConfig(base, extension);

    expect(merged).toEqual({
      fallback: { value: 'base fallback' },
      circuitBreaker: { failures: 4, resetMs: 500 },
      retry: {
        attempts: 3,
        delayMs: 25,
        backoffFactor: 2,
        idempotent: true,
      },
      timeout: false,
      order: ['fallback', 'retry', 'circuitBreaker', 'timeout'],
    });
  });

  it('does not mutate or retain mutable nested input objects', () => {
    const base: PolicyConfig<Args, string> = {
      retry: { attempts: 2, delayMs: 5, idempotent: true },
      timeout: { ms: 50 },
    };
    const extension = {
      retry: { backoffFactor: 3 },
    };

    const merged = mergePolicyConfig(base, extension);

    expect(base).toEqual({
      retry: { attempts: 2, delayMs: 5, idempotent: true },
      timeout: { ms: 50 },
    });
    expect(extension).toEqual({ retry: { backoffFactor: 3 } });
    expect(merged.retry).toEqual({
      attempts: 2,
      delayMs: 5,
      backoffFactor: 3,
      idempotent: true,
    });

    if (merged.retry !== false && merged.retry !== undefined) {
      expect(merged.retry).not.toBe(base.retry);
      expect(merged.retry).not.toBe(extension.retry);
    }
  });

  it('rejects unknown top-level and layer keys instead of silently carrying them forward', () => {
    const unknownTopLevel = { unknownLayer: { enabled: true } } as unknown as Partial<
      PolicyConfig<Args, string>
    >;
    const unknownRetryOption = {
      retry: { attempts: 2, idempotent: true, jitter: true },
    } as unknown as Partial<PolicyConfig<Args, string>>;

    expectInvalidMerge({}, unknownTopLevel, 'unknownLayer');
    expectInvalidMerge({}, unknownRetryOption, 'retry.jitter');
  });
});

function expectInvalidMerge(
  base: PolicyConfig<Args, string>,
  extension: Partial<PolicyConfig<Args, string>>,
  path: string,
): void {
  try {
    mergePolicyConfig(base, extension);
    throw new Error('Expected mergePolicyConfig to reject an unknown policy key');
  } catch (error) {
    expect(error).toMatchObject({ code: 'INVALID_POLICY', path });
  }
}
