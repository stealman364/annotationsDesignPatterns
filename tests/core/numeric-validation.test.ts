import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeout } from '../../src/operators/timeout';
import { retry } from '../../src/operators/retry';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { overlap } from '../../src/operators/overlap';
import { keyedLock } from '../../src/operators/keyed-lock';
import { cachedFor, cachedForWithHandle } from '../../src/operators/cached-for';
import { Timeout } from '../../src/patterns/utility/timeout';
import { Retry } from '../../src/patterns/utility/retry';
import { Semaphore } from '../../src/patterns/utility/semaphore';
import { Debounce } from '../../src/patterns/utility/debounce';
import { CachedFor } from '../../src/patterns/utility/cached-for';
import { Throttle } from '../../src/patterns/utility/throttle';
import { RateLimit } from '../../src/patterns/utility/rate-limit';
import { hedge } from '../../src/experimental/hedge';
import { AsyncMemoryStore } from '../../src/store/async-memory-store';
import { RemoteAsyncStore } from '../../src/store/remote-store';
import { InvalidPolicyError, validatePolicyConfig } from '../../src/policy/validation';

const values = [NaN, -Infinity, Infinity, -1, 0, 0.5, 1, 2 ** 31 - 1, 2 ** 31];
const maxTimerDelay = 2 ** 31 - 1;

describe('numeric domain validation', () => {
  afterEach(() => vi.useRealTimers());

  it.each(values)('validates portable timer delays: %s', (value) => {
    const timers = [
      { create: () => timeout(value), zero: true },
      { create: () => Timeout(value), zero: false },
      { create: () => Debounce(value), zero: false },
      { create: () => retry({ attempts: 1, delayMs: value }), zero: true },
      { create: () => Retry({ attempts: 1, delayMs: value }), zero: true },
      { create: () => hedge({ delayMs: value, idempotent: true }), zero: true },
      {
        create: () => new RemoteAsyncStore(new AsyncMemoryStore(), { timeoutMs: value }),
        zero: true,
      },
    ];
    for (const { create, zero } of timers) {
      if (Number.isFinite(value) && value <= maxTimerDelay && (zero ? value >= 0 : value > 0)) {
        expect(create).not.toThrow();
      } else {
        expect(create).toThrow(RangeError);
      }
    }
  });

  it.each([...values, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'validates positive safe counts: %s',
    (value) => {
      const counts = [
        () => retry({ attempts: value }),
        () => Retry({ attempts: value }),
        () => Semaphore(value),
        () => RateLimit(value, 1),
        () => circuitBreaker({ failures: value, resetMs: 1 }),
      ];
      for (const create of counts) {
        if (Number.isSafeInteger(value) && value >= 1) expect(create).not.toThrow();
        else expect(create).toThrow(RangeError);
      }
    },
  );

  it.each([...values, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'validates non-negative safe queue counts: %s',
    (value) => {
      for (const create of [
        () => overlap({ mode: 'queue', key: () => 'key', maxQueue: value }),
        () => keyedLock({ key: () => 'key', maxQueue: value }),
      ]) {
        if (Number.isSafeInteger(value) && value >= 0) expect(create).not.toThrow();
        else expect(create).toThrow(RangeError);
      }
    },
  );

  it.each(values)('validates TTL independently from timers: %s', async (value) => {
    for (const create of [() => cachedFor(value), () => cachedForWithHandle(value)]) {
      if (!Number.isNaN(value) && value >= 0) expect(create).not.toThrow();
      else expect(create).toThrow(RangeError);
    }
    if (!Number.isNaN(value) && value > 0) expect(() => CachedFor(value)).not.toThrow();
    else expect(() => CachedFor(value)).toThrow(RangeError);
    const setting = new AsyncMemoryStore().set('key', 'value', { ttlMs: value });
    if (!Number.isNaN(value) && value >= 0) await expect(setting).resolves.toBeUndefined();
    else await expect(setting).rejects.toBeInstanceOf(RangeError);
  });

  it.each(values)('validates finite elapsed-time windows: %s', (value) => {
    for (const create of [
      () => Throttle(value),
      () => RateLimit(1, value),
      () => circuitBreaker({ failures: 1, resetMs: value }),
    ]) {
      if (Number.isFinite(value) && value > 0) expect(create).not.toThrow();
      else expect(create).toThrow(RangeError);
    }
  });

  it.each(values)('validates finite backoff factors at least one: %s', (value) => {
    const create = () => retry({ attempts: 1, backoffFactor: value });
    if (Number.isFinite(value) && value >= 1) expect(create).not.toThrow();
    else expect(create).toThrow(RangeError);
  });

  it.each([
    ['retry.attempts', { retry: { attempts: 1.5, idempotent: true } }],
    ['retry.delayMs', { retry: { attempts: 1, delayMs: 2 ** 31, idempotent: true } }],
    ['timeout.ms', { timeout: { ms: 2 ** 31 } }],
    ['circuitBreaker.failures', { circuitBreaker: { failures: 1.5, resetMs: 1 } }],
  ])('preserves InvalidPolicyError and its %s path', (path, config) => {
    expect(() => validatePolicyConfig(config)).toThrow(InvalidPolicyError);
    expect(() => validatePolicyConfig(config)).toThrow(expect.objectContaining({ path }));
  });

  it('clamps retry backoff before scheduling even when multiplication overflows', async () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const failure = new Error('business');
    let calls = 0;
    const operation = retry<object, readonly [], string>({
      attempts: 3,
      delayMs: maxTimerDelay,
      backoffFactor: Number.MAX_VALUE,
    }).apply(() => {
      if (++calls < 3) throw failure;
      return 'ok';
    });
    const result = operation.call({});
    await vi.advanceTimersByTimeAsync(maxTimerDelay);
    expect(timer.mock.calls.map((call) => call[1])).toEqual([maxTimerDelay, maxTimerDelay]);
    await vi.advanceTimersByTimeAsync(maxTimerDelay);
    await expect(result).resolves.toBe('ok');
    timer.mockRestore();
  });
});
