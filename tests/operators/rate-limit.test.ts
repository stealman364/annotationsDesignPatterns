import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import type { ContextualOperator } from '../../src/core/contextual-operator';
import {
  isRateLimitExceededError,
  rateLimit,
  RateLimitExceededError,
} from '../../src/operators/rate-limit';
import { pipe } from '../../src/public/pipe';
import { retry } from '../../src/operators/retry';

afterEach(() => vi.restoreAllMocks());

describe('functional rateLimit', () => {
  it('safely rejects unbranded functions and hostile error proxies', () => {
    expect(isRateLimitExceededError(null)).toBe(false);
    expect(isRateLimitExceededError(() => undefined)).toBe(false);
    expect(
      isRateLimitExceededError(
        new Proxy(
          {},
          {
            get() {
              throw new Error('hostile');
            },
          },
        ),
      ),
    ).toBe(false);
  });
  it('preserves admitted sync values, throws, promise identity, and rejects excess calls', async () => {
    let calls = 0;
    const operation = rateLimit<object, readonly [], number>({ limit: 3, windowMs: 1_000 }).apply(
      () => {
        calls += 1;
        if (calls === 2) throw new Error('business failure');
        if (calls === 3) return pending;
        return 7;
      },
    );
    let resolve!: (value: number) => void;
    const pending = new Promise<number>((done) => {
      resolve = done;
    });

    expect(operation.call({})).toBe(7);
    expect(() => operation.call({})).toThrow('business failure');
    const admitted = operation.call({});
    expect(admitted).toBe(pending);
    const rejected = operation.call({});
    expect(rejected).toBeInstanceOf(Promise);
    await expect(rejected).rejects.toMatchObject({
      name: 'RateLimitExceededError',
      code: 'POLICY_ERROR',
      retryAfterMs: expect.any(Number),
    });
    resolve(9);
    await expect(admitted).resolves.toBe(9);
    expect(calls).toBe(3);
  });

  it('expires admissions at the exact window boundary and reports remaining wait', async () => {
    let now = 10;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const operation = rateLimit({ limit: 2, windowMs: 50 }).apply(() => 'ok');
    operation.call({});
    now = 20;
    operation.call({});
    now = 30;
    await expect(operation()).rejects.toMatchObject({ retryAfterMs: 30 });
    now = 59.999;
    await expect(operation()).rejects.toMatchObject({ retryAfterMs: expect.closeTo(0.001, 3) });
    now = 60;
    expect(operation()).toBe('ok');
  });

  it('reserves synchronously before reentrant body calls and bounds rejected-call history', async () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    let nested: string | PromiseLike<string> | undefined;
    let calls = 0;
    const operation = rateLimit<object, readonly [], string>({ limit: 1, windowMs: 1 }).apply(
      () => {
        calls += 1;
        nested = operation.call({});
        return 'outer';
      },
    );
    expect(operation.call({})).toBe('outer');
    await expect(nested!).rejects.toBeInstanceOf(RateLimitExceededError);
    for (let index = 0; index < 5_000; index += 1) {
      await expect(operation.call({})).rejects.toBeInstanceOf(RateLimitExceededError);
    }
    expect(calls).toBe(1);
  });

  it('does not charge a pre-aborted contextual invocation', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    const contextual = rateLimit<object, readonly [], string>({
      limit: 1,
      windowMs: 100,
    }) as ContextualOperator<object, readonly [], string, string>;
    const method = contextual.applyWithContext(() => 'ok');
    await expect(
      method.call({}, createOperationContext({}, [], { signal: controller.signal })),
    ).rejects.toBe(reason);
    expect(contextual.apply(() => 'admitted').call({})).toBe('admitted');
  });

  it('recognizes branded errors across separately evaluated copies', async () => {
    const operation = rateLimit({ limit: 1, windowMs: 100 }).apply(() => 'ok');
    operation.call({});
    let error: unknown;
    try {
      await operation.call({});
    } catch (caught) {
      error = caught;
    }
    expect(isRateLimitExceededError(error)).toBe(true);
    const foreignCopy = Object.defineProperty(
      new Error('limit'),
      Symbol.for('annotations-design-patterns.rate-limit-exceeded'),
      { value: true },
    );
    expect(isRateLimitExceededError(foreignCopy)).toBe(true);
    expect(isRateLimitExceededError({ name: 'RateLimitExceededError' })).toBe(false);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid limit %s', (limit) => {
    expect(() => rateLimit({ limit, windowMs: 1 })).toThrow(RangeError);
  });

  it.each([0, -1, Infinity, NaN])('rejects invalid windowMs %s', (windowMs) => {
    expect(() => rateLimit({ limit: 1, windowMs })).toThrow(RangeError);
  });

  it('keeps both retry composition orders independent', async () => {
    let outsideCalls = 0;
    const outside = pipe(
      () => {
        outsideCalls += 1;
        if (outsideCalls === 1) throw new Error('transient');
        return 'ok';
      },
      rateLimit({ limit: 1, windowMs: 1_000 }),
      retry({ attempts: 2 }),
    );
    let insideCalls = 0;
    const inside = pipe(
      () => {
        insideCalls += 1;
        if (insideCalls === 1) throw new Error('transient');
        return 'ok';
      },
      retry({ attempts: 2 }),
      rateLimit({ limit: 1, windowMs: 1_000 }),
    );
    await expect(outside()).resolves.toBe('ok');
    expect(outsideCalls).toBe(2);
    await expect(inside()).rejects.toBeInstanceOf(RateLimitExceededError);
    expect(insideCalls).toBe(1);
  });
});
