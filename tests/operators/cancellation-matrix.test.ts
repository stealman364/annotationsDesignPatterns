import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PolicyEvent } from '../../src/core/events';
import type { Operator } from '../../src/core/operator';
import { cachedFor } from '../../src/operators/cached-for';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { fallback } from '../../src/operators/fallback';
import { memoize } from '../../src/operators/memoize';
import { overlap } from '../../src/operators/overlap';
import { retry } from '../../src/operators/retry';
import { timeout, TimeoutError } from '../../src/operators/timeout';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

type NoArgs = readonly [];
type StringOperator = Operator<object, NoArgs, string, string>;
type OperatorName = 'retry' | 'fallback' | 'circuitBreaker' | 'memoize' | 'cachedFor' | 'share';

const names: readonly OperatorName[] = [
  'retry',
  'fallback',
  'circuitBreaker',
  'memoize',
  'cachedFor',
  'share',
];

function createOperator(name: OperatorName): StringOperator {
  switch (name) {
    case 'retry':
      return retry({ attempts: 2 });
    case 'fallback':
      return fallback('recovered');
    case 'circuitBreaker':
      return circuitBreaker({ failures: 1, resetMs: 100 });
    case 'memoize':
      return memoize();
    case 'cachedFor':
      return cachedFor(1_000);
    case 'share':
      return overlap({ mode: 'share', key: () => 'key' });
  }
}

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe.each(names)('%s cancellation matrix', (name) => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rejects a pre-aborted caller before invoking work', async () => {
    const controller = new AbortController();
    controller.abort(NaN);
    let calls = 0;
    const operation = pipe(() => {
      calls += 1;
      return 'unexpected';
    }, createOperator(name));
    await expect(run({}, [], operation, { signal: controller.signal })).rejects.toBe(NaN);
    expect(calls).toBe(0);
  });

  it.each([new Error('caller reason'), 'caller string', null, NaN])(
    'rejects with the exact caller reason %s without recovery or additional work',
    async (reason) => {
      const controller = new AbortController();
      const pending = deferred();
      const events: PolicyEvent[] = [];
      let calls = 0;
      const operation = pipe(() => {
        calls += 1;
        return pending.promise;
      }, createOperator(name));
      const result = run({}, [], operation, {
        signal: controller.signal,
        eventSink: { emit: (event) => events.push(event) },
      });

      controller.abort(reason);
      await expect(result).rejects.toBe(reason);
      expect(calls).toBe(1);
      expect(events.some(({ kind }) => kind === 'fallback.used' || kind === 'circuit.open')).toBe(
        false,
      );
      pending.resolve('late success');
      await Promise.resolve();
    },
  );

  it.each([new Error('business error'), new DOMException('unrelated abort', 'AbortError')])(
    'keeps ordinary failure semantics for %s',
    async (failure) => {
      const events: PolicyEvent[] = [];
      const controller = new AbortController();
      let calls = 0;
      const operation = pipe(() => {
        calls += 1;
        return Promise.reject(failure);
      }, createOperator(name));
      const result = run({}, [], operation, {
        signal: controller.signal,
        eventSink: { emit: (event) => events.push(event) },
      });

      if (name === 'fallback') await expect(result).resolves.toBe('recovered');
      else await expect(result).rejects.toBe(failure);
      expect(calls).toBe(name === 'retry' ? 2 : 1);
      if (name === 'circuitBreaker') {
        expect(events.map(({ kind }) => kind)).toEqual(['circuit.open']);
      }
      if (name === 'memoize' || name === 'cachedFor' || name === 'share') {
        await expect(run({}, [], operation, { signal: controller.signal })).rejects.toBe(failure);
        expect(calls).toBe(2);
      }
    },
  );

  it('keeps internal timeout semantics rather than classifying a timeout as caller abort', async () => {
    vi.useFakeTimers();
    const events: PolicyEvent[] = [];
    const controller = new AbortController();
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        return new Promise<string>(() => undefined);
      },
      createOperator(name),
      timeout<object, NoArgs, string>(10),
    );
    const result = run({}, [], operation, {
      signal: controller.signal,
      eventSink: { emit: (event) => events.push(event) },
    });
    const assertion =
      name === 'fallback'
        ? expect(result).resolves.toBe('recovered')
        : expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(controller.signal.aborted).toBe(false);
    expect(calls).toBe(name === 'retry' ? 2 : 1);
    if (name === 'circuitBreaker')
      expect(events.some(({ kind }) => kind === 'circuit.open')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['success', 'rejection', 'abort'] as const)(
    'cleans caller abort listeners on %s',
    async (outcome) => {
      const controller = new AbortController();
      const added = vi.spyOn(controller.signal, 'addEventListener');
      const removed = vi.spyOn(controller.signal, 'removeEventListener');
      const pending = deferred();
      const reason = new Error(outcome);
      const operation = pipe(() => pending.promise, createOperator(name));
      const result = run({}, [], operation, { signal: controller.signal });
      const assertion =
        outcome === 'success'
          ? expect(result).resolves.toBe('ok')
          : outcome === 'rejection' && name === 'fallback'
            ? expect(result).resolves.toBe('recovered')
            : expect(result).rejects.toBe(reason);
      if (outcome === 'success') pending.resolve('ok');
      else if (outcome === 'rejection') pending.reject(reason);
      else controller.abort(reason);
      await assertion;
      expect(added.mock.calls.some(([event]) => event === 'abort')).toBe(true);
      for (const [event, listener] of added.mock.calls) {
        if (event === 'abort') {
          expect(
            removed.mock.calls.some(
              ([removedEvent, removedListener]) =>
                removedEvent === 'abort' && removedListener === listener,
            ),
          ).toBe(true);
        }
      }
      if (outcome === 'abort') pending.reject(new Error('late rejection is observed'));
      await Promise.resolve();
    },
  );
});

describe('circuit breaker cancellation accounting', () => {
  afterEach(() => vi.useRealTimers());

  it('neither increments nor resets a previous failure when a caller cancels', async () => {
    const failure = new Error('business');
    const cancelled = deferred();
    const controller = new AbortController();
    const reason = NaN;
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        return calls === 2 ? cancelled.promise : Promise.reject(failure);
      },
      circuitBreaker<object, NoArgs, string>({ failures: 2, resetMs: 100 }),
    );

    await expect(run({}, [], operation, {})).rejects.toBe(failure);
    const result = run({}, [], operation, { signal: controller.signal });
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    cancelled.resolve('late success');
    await Promise.resolve();
    await expect(run({}, [], operation, {})).rejects.toBe(failure);
    await expect(run({}, [], operation, {})).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(calls).toBe(3);
  });

  it('does not reset a previous failure if abort wins after work resolves but before recovery runs', async () => {
    const failure = new Error('business');
    const pending = deferred();
    const controller = new AbortController();
    const reason = new Error('abort in settlement microtask gap');
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        return calls === 2 ? pending.promise : Promise.reject(failure);
      },
      circuitBreaker<object, NoArgs, string>({ failures: 2, resetMs: 100 }),
    );

    await expect(run({}, [], operation, {})).rejects.toBe(failure);
    const result = run({}, [], operation, { signal: controller.signal });
    pending.resolve('completed underneath');
    queueMicrotask(() => controller.abort(reason));
    await expect(result).rejects.toBe(reason);
    await expect(run({}, [], operation, {})).rejects.toBe(failure);
    await expect(run({}, [], operation, {})).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(calls).toBe(3);
  });

  it('does not count a rejection if caller abort wins before the failure handler runs', async () => {
    const pending = deferred();
    const controller = new AbortController();
    const reason = new Error('caller wins before failure accounting');
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        return calls === 1 ? pending.promise : 'ok';
      },
      circuitBreaker<object, NoArgs, string>({ failures: 1, resetMs: 100 }),
    );
    const result = run({}, [], operation, { signal: controller.signal });
    pending.reject(new Error('business rejection'));
    queueMicrotask(() => controller.abort(reason));
    await expect(result).rejects.toBe(reason);
    expect(run({}, [], operation, {})).toBe('ok');
    expect(calls).toBe(2);
  });

  it('counts an internal deadline abort as failure even inside the timeout context', async () => {
    vi.useFakeTimers();
    const events: PolicyEvent[] = [];
    const controller = new AbortController();
    const operation = pipe(
      () => new Promise<string>(() => undefined),
      timeout<object, NoArgs, string>(10),
      circuitBreaker<object, NoArgs, string>({ failures: 1, resetMs: 100 }),
    );
    const result = run({}, [], operation, {
      signal: controller.signal,
      eventSink: { emit: (event) => events.push(event) },
    });
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(controller.signal.aborted).toBe(false);
    expect(events.map(({ kind }) => kind)).toEqual(['timeout.triggered', 'circuit.open']);
  });

  it('frees a cancelled HALF_OPEN probe without emitting closed or opening again', async () => {
    vi.useFakeTimers();
    const failure = new Error('business');
    const cancelled = deferred();
    const events: PolicyEvent[] = [];
    const eventSink = { emit: (event: PolicyEvent) => events.push(event) };
    const controller = new AbortController();
    const reason = new Error('probe cancelled');
    let calls = 0;
    const operation = pipe(
      () => {
        calls += 1;
        if (calls === 1) throw failure;
        return calls === 2 ? cancelled.promise : 'recovered';
      },
      circuitBreaker<object, NoArgs, string>({ failures: 1, resetMs: 100 }),
    );

    await expect(run({}, [], operation, { eventSink })).rejects.toBe(failure);
    vi.advanceTimersByTime(100);
    const result = run({}, [], operation, { signal: controller.signal, eventSink });
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(events.map(({ kind }) => kind)).toEqual(['circuit.open', 'circuit.half_open']);
    expect(run({}, [], operation, { eventSink })).toBe('recovered');
    cancelled.reject(new Error('late obsolete failure'));
    await Promise.resolve();
    expect(run({}, [], operation, { eventSink })).toBe('recovered');
    expect(events.map(({ kind }) => kind)).toEqual([
      'circuit.open',
      'circuit.half_open',
      'circuit.half_open',
      'circuit.closed',
    ]);
  });
});

describe('caller cancellation from event sinks before user callbacks', () => {
  it('does not run fallback if caller abort wins before the rejection handler runs', async () => {
    const pending = deferred();
    const controller = new AbortController();
    const reason = new Error('caller wins before fallback');
    let callbacks = 0;
    const operation = pipe(
      () => pending.promise,
      fallback<object, NoArgs, string>(() => {
        callbacks += 1;
        return 'unexpected';
      }),
    );
    const result = run({}, [], operation, { signal: controller.signal });
    pending.reject(new Error('business rejection'));
    queueMicrotask(() => controller.abort(reason));
    await expect(result).rejects.toBe(reason);
    expect(callbacks).toBe(0);
  });

  it.each([
    ['retry', 'retry.attempt'],
    ['memoize', 'cache.miss'],
    ['cachedFor', 'cache.miss'],
    ['share', 'overlap.started'],
  ] as const)('%s checks cancellation after emitting %s', async (name, eventKind) => {
    const controller = new AbortController();
    const reason = new Error('sink cancelled caller');
    let calls = 0;
    const operation = pipe(() => {
      calls += 1;
      return 'unexpected';
    }, createOperator(name));
    await expect(
      run({}, [], operation, {
        signal: controller.signal,
        eventSink: {
          emit(event) {
            if (event.kind === eventKind) controller.abort(reason);
          },
        },
      }),
    ).rejects.toBe(reason);
    expect(calls).toBe(0);
  });

  it('does not invoke the fallback callback if fallback.used cancels the caller', async () => {
    const controller = new AbortController();
    const reason = new Error('sink cancelled caller');
    let callbacks = 0;
    const operation = pipe(
      (): string => {
        throw new Error('business');
      },
      fallback<object, NoArgs, string>(() => {
        callbacks += 1;
        return 'unexpected';
      }),
    );
    await expect(
      run({}, [], operation, {
        signal: controller.signal,
        eventSink: {
          emit(event) {
            if (event.kind === 'fallback.used') controller.abort(reason);
          },
        },
      }),
    ).rejects.toBe(reason);
    expect(callbacks).toBe(0);
  });
});

describe.each(['memoize', 'cachedFor', 'share'] as const)('%s caller isolation', (name) => {
  it('isolates two different cancellation reasons while a third consumer receives the shared result', async () => {
    const pending = deferred();
    const first = new AbortController();
    const second = new AbortController();
    const survivor = new AbortController();
    const firstReason = new Error('first');
    const secondReason = NaN;
    let calls = 0;
    const operation = pipe(() => {
      calls += 1;
      return pending.promise;
    }, createOperator(name));
    const a = run({}, [], operation, { signal: first.signal });
    const b = run({}, [], operation, { signal: second.signal });
    const c = run({}, [], operation, { signal: survivor.signal });
    first.abort(firstReason);
    second.abort(secondReason);
    await expect(a).rejects.toBe(firstReason);
    await expect(b).rejects.toBe(secondReason);
    expect(calls).toBe(1);
    pending.resolve('shared result');
    await expect(c).resolves.toBe('shared result');
    await expect(Promise.resolve(run({}, [], operation, {}))).resolves.toBe('shared result');
    expect(calls).toBe(name === 'share' ? 2 : 1);
  });
});
