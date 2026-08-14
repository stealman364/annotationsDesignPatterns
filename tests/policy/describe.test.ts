import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY_ORDER } from '../../src/policy/default-order';
import { definePolicy } from '../../src/policy/define-policy';

type Args = readonly [id: string];

describe('policy extension and description', () => {
  it('extends immutably with a deep merge while leaving the original policy unchanged', () => {
    const base = definePolicy<object, Args, string>({
      fallback: { value: 'base fallback' },
      retry: { attempts: 2, delayMs: 10, idempotent: true },
      timeout: { ms: 100 },
    });
    const extended = base.extend({
      retry: { delayMs: 25, backoffFactor: 2 },
      timeout: false,
    });

    expect(base).not.toBe(extended);
    expect(base.describe()).toMatchObject({
      layers: expect.arrayContaining([
        expect.objectContaining({
          name: 'retry',
          enabled: true,
          options: expect.objectContaining({ attempts: 2, delayMs: 10 }),
        }),
        expect.objectContaining({ name: 'timeout', enabled: true }),
      ]),
    });
    expect(extended.describe()).toMatchObject({
      layers: expect.arrayContaining([
        {
          name: 'retry',
          enabled: true,
          options: expect.objectContaining({
            attempts: 2,
            delayMs: 25,
            backoffFactor: 2,
          }),
        },
        { name: 'timeout', enabled: false },
      ]),
    });
  });

  it('returns a deterministic, JSON-serializable canonical description', () => {
    const policy = definePolicy<object, Args, string>({
      fallback: {
        value(error, id): string {
          void error;
          return `${id}:fallback`;
        },
      },
      retry: {
        attempts: 3,
        idempotent: true,
        shouldRetry(error): boolean {
          return error instanceof Error;
        },
      },
      timeout: { ms: 50 },
    });

    const first = policy.describe();
    const second = policy.describe();

    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    expect(first).toEqual({
      order: ['fallback', 'circuitBreaker', 'retry', 'timeout'],
      layers: [
        {
          name: 'fallback',
          enabled: true,
          options: { value: '[function]' },
        },
        { name: 'circuitBreaker', enabled: false },
        {
          name: 'retry',
          enabled: true,
          options: {
            attempts: 3,
            delayMs: 0,
            backoffFactor: 1,
            idempotent: true,
            shouldRetry: '[function]',
          },
        },
        {
          name: 'timeout',
          enabled: true,
          options: { ms: 50, scope: 'perAttempt' },
        },
      ],
      experimental: false,
    });
  });

  it('does not permit callers to mutate the canonical default order', () => {
    expect(Object.isFrozen(DEFAULT_POLICY_ORDER)).toBe(true);
    expect(Reflect.set(DEFAULT_POLICY_ORDER, 0, 'timeout')).toBe(false);
    expect(DEFAULT_POLICY_ORDER).toEqual(['fallback', 'circuitBreaker', 'retry', 'timeout']);
    expect(definePolicy<object, Args, string>({}).describe().order).toEqual(DEFAULT_POLICY_ORDER);
  });

  it('normalizes non-finite values so descriptions survive a JSON round trip', () => {
    const description = definePolicy<object, Args, number>({
      fallback: { value: Number.NaN },
    }).describe();

    expect(JSON.parse(JSON.stringify(description))).toEqual(description);
    expect(description.layers[0]).toMatchObject({
      name: 'fallback',
      options: { value: '[NaN]' },
    });
  });
});
