import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { circuitBreakerWithHandle } from '../../src/operators/circuit-breaker';
import { keyedLockWithHandle } from '../../src/operators/keyed-lock';
import { semaphoreWithHandle } from '../../src/operators/semaphore';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('circuit breaker diagnostic handle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => vi.useRealTimers());

  it('shares state across applied methods and exposes only frozen snapshots', async () => {
    const { operator, handle } = circuitBreakerWithHandle<object, readonly [string], string>({
      failures: 2,
      resetMs: 100,
    });
    expect(handle.inspect()).toBeUndefined();
    const first = operator.apply((label) => {
      if (label === 'fail') throw new Error(label);
      return `first:${label}`;
    });
    const second = operator.apply((label) => `second:${label}`);

    await expect(first.call({}, 'fail')).rejects.toThrow('fail');
    expect(handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 1 });
    await expect(first.call({}, 'fail')).rejects.toThrow('fail');
    expect(handle.inspect()).toMatchObject({ state: 'OPEN', consecutiveFailures: 2 });
    await expect(second.call({}, 'blocked')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    const snapshot = handle.inspect();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => Object.assign(snapshot!, { consecutiveFailures: 0 })).toThrow();
    await expect(second.call({}, 'ok')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    vi.advanceTimersByTime(100);
    expect(second.call({}, 'ok')).toBe('second:ok');

    const isolated = circuitBreakerWithHandle<object, readonly [string], string>({
      failures: 1,
      resetMs: 100,
    });
    expect(isolated.handle.inspect()).toBeUndefined();
  });

  it('reset invalidates pending CLOSED and HALF_OPEN results without fake events', async () => {
    const pending = deferred<string>();
    const events: string[] = [];
    let fail = true;
    const { operator, handle } = circuitBreakerWithHandle<object, readonly [string], string>({
      failures: 1,
      resetMs: 100,
    });
    const operation = pipe((label: string) => {
      void label;
      if (fail) {
        fail = false;
        throw new Error('open');
      }
      return pending.promise;
    }, operator);
    await expect(run({}, ['first'], operation)).rejects.toThrow('open');
    vi.advanceTimersByTime(100);
    const probe = run({}, ['probe'], operation, {
      eventSink: { emit: (event) => events.push(event.kind) },
    });
    expect(handle.inspect()).toMatchObject({ state: 'HALF_OPEN', probeInFlight: true });
    handle.reset();
    expect(handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
    pending.resolve('late probe success');
    await expect(probe).resolves.toBe('late probe success');
    expect(handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
    expect(events).toContain('circuit.half_open');
    expect(events).not.toContain('circuit.closed');
    expect(Object.isFrozen(handle.inspect())).toBe(true);
  });

  it.each(['resolve', 'reject'] as const)(
    'reset keeps an obsolete CLOSED %s from changing current state',
    async (outcome) => {
      const pending = deferred<string>();
      const { operator, handle } = circuitBreakerWithHandle<object, readonly [], string>({
        failures: 2,
        resetMs: 100,
      });
      const operation = operator.apply(() => pending.promise);
      const invocation = operation.call({});
      handle.reset();
      if (outcome === 'resolve') {
        pending.resolve('late result');
        await expect(invocation).resolves.toBe('late result');
      } else {
        const failure = new Error('late failure');
        pending.reject(failure);
        await expect(invocation).rejects.toBe(failure);
      }
      expect(handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
    },
  );

  it('reset from isFailure or an observer callback invalidates the old decision', async () => {
    const classified = circuitBreakerWithHandle<object, readonly [], string>({
      failures: 1,
      resetMs: 100,
      isFailure() {
        classified.handle.reset();
        return true;
      },
    });
    const handle = classified.handle;
    const classifyMethod = classified.operator.apply(() => {
      throw new Error('ignored after reset');
    });
    await expect(classifyMethod.call({})).rejects.toThrow('ignored after reset');
    expect(handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });

    const observed = circuitBreakerWithHandle<object, readonly [], string>({
      failures: 1,
      resetMs: 100,
    });
    const method = pipe(() => {
      throw new Error('observer reset');
    }, observed.operator);
    await expect(
      run({}, [], method, {
        eventSink: {
          emit(event) {
            if (event.kind === 'circuit.open') observed.handle.reset();
          },
        },
      }),
    ).rejects.toThrow('observer reset');
    expect(observed.handle.inspect()).toMatchObject({ state: 'CLOSED', consecutiveFailures: 0 });
  });
});

describe('keyed lock diagnostic handle', () => {
  it('shares queues across applications and runs a queued method through its own implementation', async () => {
    const active = deferred<string>();
    const started: string[] = [];
    const { operator, handle } = keyedLockWithHandle<object, readonly [string], string>({
      key: () => 'shared',
    });
    const methodA = pipe((label: string) => {
      started.push(`A:${label}`);
      return active.promise;
    }, operator);
    const methodB = pipe((label: string) => {
      started.push(`B:${label}`);
      return `from-B:${label}`;
    }, operator);

    expect(handle.inspect('missing')).toBeUndefined();
    const first = run({}, ['active'], methodA);
    const second = run({}, ['queued'], methodB);
    expect(handle.inspect('shared')).toEqual({ active: 1, queued: 1 });
    expect(Object.isFrozen(handle.inspect('shared'))).toBe(true);
    active.resolve('from-A');
    await expect(first).resolves.toBe('from-A');
    await expect(second).resolves.toBe('from-B:queued');
    expect(started).toEqual(['A:active', 'B:queued']);
    expect(handle.inspect('shared')).toBeUndefined();
  });

  it('keeps fresh factories isolated', async () => {
    const pending = deferred<string>();
    const first = keyedLockWithHandle<object, readonly [string], string>({ key: () => 'key' });
    const second = keyedLockWithHandle<object, readonly [string], string>({ key: () => 'key' });
    const holder = pipe((key: string) => {
      void key;
      return pending.promise;
    }, first.operator);
    const independent = pipe((key: string) => key, second.operator);
    const held = run({}, ['held'], holder);
    expect(run({}, ['free'], independent)).toBe('free');
    expect(first.handle.inspect('key')).toEqual({ active: 1, queued: 0 });
    expect(second.handle.inspect('key')).toBeUndefined();
    pending.resolve('done');
    await held;
  });
});

describe('semaphore diagnostic handle', () => {
  it('shares permit counts and retains active ownership after its caller cancels', async () => {
    const active = deferred<string>();
    const controller = new AbortController();
    const reason = new Error('caller withdrew');
    const started: string[] = [];
    const { operator, handle } = semaphoreWithHandle<object, readonly [string], string>({
      permits: 1,
      maxQueue: 2,
    });
    const isolated = semaphoreWithHandle<object, readonly [string], string>({ permits: 1 });
    const methodA = pipe((label: string) => {
      started.push(`A:${label}`);
      return active.promise;
    }, operator);
    const methodB = pipe((label: string) => {
      started.push(`B:${label}`);
      return `B:${label}`;
    }, operator);
    const first = run({}, ['active'], methodA, { signal: controller.signal });
    const firstAssertion = expect(first).rejects.toBe(reason);
    const queued = run({}, ['queued'], methodB);
    expect(handle.inspect()).toEqual({ active: 1, queued: 1 });
    expect(isolated.handle.inspect()).toBeUndefined();
    controller.abort(reason);
    await firstAssertion;
    expect(handle.inspect()).toEqual({ active: 1, queued: 1 });
    active.resolve('late backend result');
    await expect(queued).resolves.toBe('B:queued');
    expect(started).toEqual(['A:active', 'B:queued']);
    expect(handle.inspect()).toBeUndefined();
  });

  it('reads keyed and unpartitioned pools without creating them', async () => {
    const { operator, handle } = semaphoreWithHandle<object, readonly [string], string>({
      permits: 1,
      key: ({ args }) => args[0],
    });
    expect(handle.inspect()).toBeUndefined();
    expect(handle.inspect('key')).toBeUndefined();
    const operation = pipe((key: string) => key, operator);
    await expect(run({}, ['key'], operation)).resolves.toBe('key');
    expect(handle.inspect('key')).toBeUndefined();
  });
});
