import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import type { PolicyEvent } from '../../src/core/events';
import type { Operator } from '../../src/core/operator';
import { cachedFor } from '../../src/operators/cached-for';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { fallback } from '../../src/operators/fallback';
import { memoize } from '../../src/operators/memoize';
import { overlap } from '../../src/operators/overlap';
import { retry } from '../../src/operators/retry';
import { timeout } from '../../src/operators/timeout';
import { definePolicy } from '../../src/policy/define-policy';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

type Args = readonly [];
const receiver = {};
function pending() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('2.1 independently reconstructed cancellation reproductions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('caller cancellation rejects without fallback', async () => {
    const controller = new AbortController();
    const reason = new Error('caller');
    const operation = pipe(
      () => new Promise<string>(() => {}),
      fallback<object, Args, string>('fallback'),
      timeout<object, Args, string>(100),
    );
    const call = run(receiver, [], operation, { signal: controller.signal });
    controller.abort(reason);
    await expect(call).rejects.toBe(reason);
  });

  it('caller cancellation does not open the breaker', async () => {
    const controller = new AbortController();
    const reason = new Error('caller');
    const operation = pipe(
      () => 'ok',
      circuitBreaker<object, Args, string>({ failures: 1, resetMs: 100 }),
      timeout<object, Args, string>(100),
    );
    controller.abort(reason);
    await expect(run(receiver, [], operation, { signal: controller.signal })).rejects.toBe(reason);
    await expect(run(receiver, [], operation, {})).resolves.toBe('ok');
  });

  it.each(['memoize', 'cachedFor', 'share'] as const)(
    '%s isolates the initiating cancellation',
    async (kind) => {
      const active = pending();
      const controller = new AbortController();
      const reason = new Error('caller A');
      const shared =
        kind === 'memoize'
          ? memoize<object, Args, string>()
          : kind === 'cachedFor'
            ? cachedFor<object, Args, string>(1_000)
            : overlap<object, Args, string>({ mode: 'share', key: () => 'key' });
      const operation = pipe(() => active.promise, shared, timeout<object, Args, string>(100));
      const first = run(receiver, [], operation, { signal: controller.signal });
      const second = run(receiver, [], operation, {});
      controller.abort(reason);
      await expect(first).rejects.toBe(reason);
      active.resolve('late');
      await expect(second).resolves.toBe('late');
    },
  );

  it('timeout without run stops retries after expiration', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const operation = pipe(
      () => {
        calls++;
        throw new Error('business');
      },
      timeout<object, Args, string>(5),
      retry<object, Args, string>({ attempts: 3, delayMs: 10 }),
    );
    const call = operation.call(receiver);
    const assertion = expect(call).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(calls).toBe(1);
  });

  it('mixed identity composition preserves contextual events', () => {
    const events: PolicyEvent[] = [];
    const plain: Operator<object, Args, string, string> = {
      name: 'identity',
      apply: (next) => next,
    };
    const operation = pipe(() => 'ok', plain, memoize<object, Args, string>());
    expect(
      run(receiver, [], operation, {
        eventSink: {
          emit(event) {
            events.push(event);
          },
        },
      }),
    ).toBe('ok');
    expect(events.map((event) => event.kind)).toEqual(['cache.miss']);
  });

  it('global timeout plus retry does not require a static signal', () => {
    expect(() =>
      definePolicy<object, Args, string>({
        retry: { attempts: 2, idempotent: true },
        timeout: { ms: 10, scope: 'global' },
      }),
    ).not.toThrow();
  });

  it('explicit context IDs do not increment the public sequence', () => {
    const before = createOperationContext(receiver, [], {});
    createOperationContext(receiver, [], { operationId: 'explicit' });
    const after = createOperationContext(receiver, [], {});
    expect(Number(after.operationId.split('-')[1])).toBe(
      Number(before.operationId.split('-')[1]) + 1,
    );
  });

  it('retains one public context allocation for a pre-aborted run', async () => {
    const before = createOperationContext(receiver, [], {});
    const controller = new AbortController();
    controller.abort('preabort');
    await expect(
      run(receiver, [], () => 'unreachable', { signal: controller.signal }),
    ).rejects.toBe('preabort');
    const after = createOperationContext(receiver, [], {});
    expect(Number(after.operationId.split('-')[1])).toBe(
      Number(before.operationId.split('-')[1]) + 2,
    );
  });

  it('timeout synthesis does not consume a public operation ID and exposes its signal', async () => {
    let observedSignal: AbortSignal | undefined;
    const inspect = {
      name: 'inspect',
      apply(next: () => string) {
        return next;
      },
      applyWithContext() {
        return (
          _context:
            import('../../src/core/context').RuntimeOperationContext<object, Args> | undefined,
        ) => {
          observedSignal = _context?.signal;
          return 'ok';
        };
      },
    };
    const before = createOperationContext(receiver, [], {});
    const operation = pipe(() => 'ok', timeout<object, Args, string>(10), inspect);
    await expect(operation.call(receiver)).resolves.toBe('ok');
    const after = createOperationContext(receiver, [], {});
    expect(observedSignal).toBeInstanceOf(AbortSignal);
    expect(Number(after.operationId.split('-')[1])).toBe(
      Number(before.operationId.split('-')[1]) + 1,
    );
  });

  it.each(['bare', 'fallback', 'breaker', 'timeout'] as const)(
    '%s prioritizes a synchronous caller abort over a subsequent throw',
    async (kind) => {
      const controller = new AbortController();
      const reason = new Error('caller');
      let fallbacks = 0;
      let cancelling = true;
      const base = () => {
        if (cancelling) {
          controller.abort(reason);
          throw new Error('late business error');
        }
        return 'ok';
      };
      const operation =
        kind === 'bare'
          ? base
          : pipe(
              base,
              kind === 'fallback'
                ? fallback<object, Args, string>(() => {
                    fallbacks++;
                    return 'fallback';
                  })
                : kind === 'breaker'
                  ? circuitBreaker<object, Args, string>({ failures: 1, resetMs: 100 })
                  : timeout<object, Args, string>(100),
            );
      let call: unknown;
      expect(() => {
        call = run(receiver, [], operation, { signal: controller.signal });
      }).not.toThrow();
      await expect(call).rejects.toBe(reason);
      expect(fallbacks).toBe(0);
      cancelling = false;
      await expect(Promise.resolve(run(receiver, [], operation, {}))).resolves.toBe('ok');
    },
  );

  it('keeps a reentrant shared consumer alive when the initiating event sink cancels', async () => {
    const controller = new AbortController();
    const reason = new Error('A cancelled');
    let joined: unknown;
    let calls = 0;
    const operation = pipe(
      () => {
        calls++;
        return Promise.resolve('shared result');
      },
      overlap<object, Args, string>({ mode: 'share', key: () => 'key' }),
    );
    const first = run(receiver, [], operation, {
      signal: controller.signal,
      eventSink: {
        emit(event) {
          if (event.kind === 'overlap.started') {
            joined = run(receiver, [], operation, {});
            controller.abort(reason);
          }
        },
      },
    });
    await expect(first).rejects.toBe(reason);
    await expect(joined).resolves.toBe('shared result');
    expect(calls).toBe(1);
  });
});
