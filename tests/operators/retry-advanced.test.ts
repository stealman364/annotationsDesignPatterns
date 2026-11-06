import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import { invokeWithContext } from '../../src/core/invocation';
import { retry } from '../../src/operators/retry';
import { Retry } from '../../src/patterns/utility/retry';
import { definePolicy } from '../../src/policy/define-policy';
import { InvalidPolicyError } from '../../src/policy/validation';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

describe('retry capped backoff and jitter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each(['false', 'true', 'throws'] as const)(
    'prioritizes cancellation within shouldRetry without exhausting when the callback returns %s',
    async (decision) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const reason = new Error('caller aborted inside retry decision');
      const business = new Error('business failure');
      const events: string[] = [];
      let calls = 0;
      const receiver = {};
      const operation = pipe(
        (): string => {
          calls += 1;
          throw business;
        },
        retry<object, readonly [], string>({
          attempts: 2,
          delayMs: 100,
          shouldRetry() {
            controller.abort(reason);
            if (decision === 'throws') throw new Error('decision failure');
            return decision === 'true';
          },
        }),
      );
      const context = createOperationContext(receiver, [] as const, {
        signal: controller.signal,
        eventSink: {
          emit(event): void {
            events.push(event.kind);
          },
        },
      });
      // Bypass run's outer cancellation race: the retry operator itself must
      // normalize its rejection and avoid a misleading exhaustion event.
      const result = invokeWithContext<object, readonly [], string>(
        receiver,
        [],
        operation,
        context,
      );
      await expect(result).rejects.toBe(reason);
      expect(events).toEqual(['retry.attempt']);
      expect(calls).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    ['none', [80, 100]],
    ['full', [20, 25]],
    ['equal', [50, 62.5]],
  ] as const)(
    'applies %s jitter after exponential backoff and the user cap',
    async (jitter, waits) => {
      vi.useFakeTimers();
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.25);
      const scheduled = vi.spyOn(globalThis, 'setTimeout');
      let calls = 0;
      const operation = retry<object, readonly [], string>({
        attempts: 3,
        delayMs: 80,
        backoffFactor: 2,
        maxDelayMs: 100,
        jitter,
      }).apply(() => {
        if (++calls < 3) throw new Error('retry');
        return 'ok';
      });
      const result = operation.call({});
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toBe('ok');
      expect(scheduled.mock.calls.map((call) => call[1])).toEqual(waits);
      expect(random).toHaveBeenCalledTimes(jitter === 'none' ? 0 : 2);
      expect(calls).toBe(3);
    },
  );

  it.each(['none', 'full', 'equal'] as const)(
    'uses cancellable microtasks and no random with a zero cap: %s',
    async (jitter) => {
      vi.useFakeTimers();
      const random = vi.spyOn(Math, 'random');
      const scheduled = vi.spyOn(globalThis, 'setTimeout');
      let calls = 0;
      const operation = retry<object, readonly [], string>({
        attempts: 2,
        delayMs: 100,
        maxDelayMs: 0,
        jitter,
      }).apply(() => {
        if (++calls === 1) throw new Error('retry');
        return 'ok';
      });
      await expect(operation.call({})).resolves.toBe('ok');
      expect(scheduled).not.toHaveBeenCalled();
      expect(random).not.toHaveBeenCalled();
    },
  );

  it('does not call random for a zero base delay and uses no timer when full jitter selects zero', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    for (const delayMs of [0, 100]) {
      let calls = 0;
      const operation = retry<object, readonly [], string>({
        attempts: 2,
        delayMs,
        jitter: 'full',
      }).apply(() => {
        if (++calls === 1) throw new Error('retry');
        return 'ok';
      });
      await expect(operation.call({})).resolves.toBe('ok');
    }
    expect(random).toHaveBeenCalledTimes(1);
    expect(scheduled).not.toHaveBeenCalled();
  });

  it('caps an overflowing exponential calculation before scheduling', async () => {
    vi.useFakeTimers();
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    let calls = 0;
    const operation = retry<object, readonly [], string>({
      attempts: 3,
      delayMs: 2_147_483_647,
      backoffFactor: Number.MAX_VALUE,
      maxDelayMs: 10,
    }).apply(() => {
      if (++calls < 3) throw new Error('retry');
      return 'ok';
    });
    const result = operation.call({});
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toBe('ok');
    expect(scheduled.mock.calls.map((call) => call[1])).toEqual([10, 10]);
  });

  it('cancels a capped jittered wait without making another attempt', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        throw new Error('retry');
      },
      retry<object, readonly [], string>({
        attempts: 3,
        delayMs: 100,
        maxDelayMs: 80,
        jitter: 'equal',
      }),
    );
    const result = run({}, [], operation, { signal: controller.signal });
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([NaN, -Infinity, Infinity, -1, 2 ** 31])(
    'rejects invalid maxDelayMs %s with existing error classes',
    (maxDelayMs) => {
      expect(() => retry({ attempts: 2, maxDelayMs })).toThrow(RangeError);
      expect(() => Retry({ attempts: 2, maxDelayMs })).toThrow(RangeError);
      expect(() => definePolicy({ retry: { attempts: 2, idempotent: true, maxDelayMs } })).toThrow(
        InvalidPolicyError,
      );
      expect(() => definePolicy({ retry: { attempts: 2, idempotent: true, maxDelayMs } })).toThrow(
        expect.objectContaining({ path: 'retry.maxDelayMs' }),
      );
    },
  );

  it.each(['unexpected', null, false, 1])('rejects invalid jitter %s at construction', (jitter) => {
    const options = { attempts: 2, jitter } as unknown as Parameters<typeof retry>[0];
    expect(() => retry(options)).toThrow(RangeError);
    expect(() => Retry(options)).toThrow(RangeError);
    expect(() => definePolicy({ retry: { ...options, idempotent: true } })).toThrow(
      expect.objectContaining({ path: 'retry.jitter' }),
    );
  });

  it('snapshots advanced decorator options before user mutation', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random');
    const scheduled = vi.spyOn(globalThis, 'setTimeout');
    const options = {
      attempts: 2,
      delayMs: 100,
      maxDelayMs: 10,
      jitter: 'none' as 'none' | 'full',
    };
    const decorator = Retry(options);
    options.maxDelayMs = 1_000;
    options.jitter = 'full';
    class Service {
      calls = 0;
      @decorator
      async load(): Promise<string> {
        if (++this.calls === 1) throw new Error('retry');
        return 'ok';
      }
    }
    const result = new Service().load();
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe('ok');
    expect(scheduled.mock.calls.map((call) => call[1])).toEqual([10]);
    expect(random).not.toHaveBeenCalled();
  });

  it('forwards policy options and describes them only when explicitly configured', async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const base = definePolicy<object, readonly [], string>({
      retry: { attempts: 2, idempotent: true, delayMs: 100 },
    });
    const originalDescription = base.describe();
    expect(
      originalDescription.layers.find(({ name }) => name === 'retry')?.options,
    ).not.toHaveProperty('jitter');
    expect(
      originalDescription.layers.find(({ name }) => name === 'retry')?.options,
    ).not.toHaveProperty('maxDelayMs');
    const policy = base.extend({ retry: { maxDelayMs: 20, jitter: 'equal' } });
    expect(policy.describe().layers.find(({ name }) => name === 'retry')?.options).toMatchObject({
      maxDelayMs: 20,
      jitter: 'equal',
    });
    expect(base.describe()).toEqual(originalDescription);
    let calls = 0;
    const operation = pipe(() => {
      if (++calls === 1) throw new Error('retry');
      return 'ok';
    }, policy.operator());
    const result = operation.call({});
    await vi.advanceTimersByTimeAsync(14);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe('ok');
    expect(random).toHaveBeenCalledTimes(1);
  });
});
