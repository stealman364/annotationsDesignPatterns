import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolicyEvent } from '../../src/core/events';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

const resetMs = 100;

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function scenario() {
  const oldProbe = deferred();
  const newProbe = deferred();
  const events: PolicyEvent[] = [];
  const calls: string[] = [];
  const businessFailure = new Error('business failure');
  const operation = pipe(
    (label: string): string | Promise<string> => {
      calls.push(label);
      if (label === 'fail') throw businessFailure;
      if (label === 'old') return oldProbe.promise;
      if (label === 'new') return newProbe.promise;
      return label;
    },
    circuitBreaker<object, readonly [label: string], string>({ failures: 1, resetMs }),
  );
  const call = (label: string, signal?: AbortSignal) =>
    run({}, [label], operation, {
      operationId: label,
      signal,
      eventSink: { emit: (event) => events.push(event) },
    });
  return { oldProbe, newProbe, events, calls, businessFailure, call };
}

describe('HALF_OPEN probe lease and generation safety', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('admits a replacement exactly when the hung probe lease expires', async () => {
    const state = scenario();
    await expect(state.call('fail')).rejects.toBe(state.businessFailure);
    vi.advanceTimersByTime(resetMs);
    const old = state.call('old');
    vi.advanceTimersByTime(resetMs - 1);
    await expect(state.call('before-boundary')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    vi.advanceTimersByTime(1);
    const replacement = state.call('new');
    void Promise.resolve(replacement).catch(() => undefined);
    expect(state.calls).toEqual(['fail', 'old', 'new']);
    await expect(state.call('concurrent')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    state.newProbe.resolve('replacement success');
    await expect(replacement).resolves.toBe('replacement success');
    state.oldProbe.resolve('old success');
    await expect(old).resolves.toBe('old success');
    expect(state.call('ready')).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['resolve', 'before'],
    ['reject', 'before'],
    ['resolve', 'after'],
    ['reject', 'after'],
  ] as const)(
    'ignores an obsolete probe that %ss %s the replacement closes the circuit',
    async (outcome, timing) => {
      const state = scenario();
      await expect(state.call('fail')).rejects.toBe(state.businessFailure);
      vi.advanceTimersByTime(resetMs);
      const old = state.call('old');
      vi.advanceTimersByTime(resetMs);
      const replacement = state.call('new');
      void Promise.resolve(replacement).catch(() => undefined);
      expect(state.calls).toEqual(['fail', 'old', 'new']);
      await expect(state.call('concurrent')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });

      const settleOld = async (): Promise<void> => {
        if (outcome === 'resolve') {
          state.oldProbe.resolve('obsolete success');
          await expect(old).resolves.toBe('obsolete success');
        } else {
          state.oldProbe.reject(state.businessFailure);
          await expect(old).rejects.toBe(state.businessFailure);
        }
      };
      if (timing === 'before') {
        await settleOld();
        // Neither stale success nor stale failure can free the replacement's slot.
        await expect(state.call('still-concurrent')).rejects.toMatchObject({
          code: 'CIRCUIT_OPEN',
        });
      }
      state.newProbe.resolve('replacement success');
      await expect(replacement).resolves.toBe('replacement success');
      if (timing === 'after') await settleOld();

      expect(state.call('ready')).toBe('ready');
      expect(state.events.map(({ kind }) => kind)).toEqual([
        'circuit.open',
        'circuit.half_open',
        'circuit.half_open',
        'circuit.closed',
      ]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not release a replacement probe when an obsolete caller cancels', async () => {
    const state = scenario();
    const controller = new AbortController();
    const reason = new Error('cancel obsolete probe');
    await expect(state.call('fail')).rejects.toBe(state.businessFailure);
    vi.advanceTimersByTime(resetMs);
    const old = state.call('old', controller.signal);
    vi.advanceTimersByTime(resetMs);
    const replacement = state.call('new');
    void Promise.resolve(replacement).catch(() => undefined);
    expect(state.calls).toEqual(['fail', 'old', 'new']);
    controller.abort(reason);
    await expect(old).rejects.toBe(reason);
    await expect(state.call('concurrent')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    state.newProbe.resolve('replacement success');
    await expect(replacement).resolves.toBe('replacement success');
    state.oldProbe.reject(new Error('late abandoned work failure'));
    await Promise.resolve();
    expect(state.call('ready')).toBe('ready');
    expect(state.events.map(({ kind }) => kind)).toEqual([
      'circuit.open',
      'circuit.half_open',
      'circuit.half_open',
      'circuit.closed',
    ]);
  });

  it.each(['resolve', 'reject'] as const)(
    'does not change a reopened circuit or extend its reset when an obsolete probe %ss',
    async (outcome) => {
      const state = scenario();
      await expect(state.call('fail')).rejects.toBe(state.businessFailure);
      vi.advanceTimersByTime(resetMs);
      const old = state.call('old');
      vi.advanceTimersByTime(resetMs);
      const replacement = state.call('new');
      void Promise.resolve(replacement).catch(() => undefined);
      expect(state.calls).toEqual(['fail', 'old', 'new']);
      state.newProbe.reject(state.businessFailure);
      await expect(replacement).rejects.toBe(state.businessFailure);

      vi.advanceTimersByTime(resetMs / 2);
      if (outcome === 'resolve') {
        state.oldProbe.resolve('obsolete success');
        await expect(old).resolves.toBe('obsolete success');
      } else {
        state.oldProbe.reject(state.businessFailure);
        await expect(old).rejects.toBe(state.businessFailure);
      }
      await expect(state.call('still-open')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
      vi.advanceTimersByTime(resetMs / 2);
      expect(state.call('ready')).toBe('ready');
      expect(state.events.map(({ kind }) => kind)).toEqual([
        'circuit.open',
        'circuit.half_open',
        'circuit.half_open',
        'circuit.open',
        'circuit.half_open',
        'circuit.closed',
      ]);
    },
  );

  it('releases the current probe position after caller cancellation', async () => {
    const state = scenario();
    const controller = new AbortController();
    const reason = new Error('cancel current probe');
    await expect(state.call('fail')).rejects.toBe(state.businessFailure);
    vi.advanceTimersByTime(resetMs);
    const old = state.call('old', controller.signal);
    controller.abort(reason);
    await expect(old).rejects.toBe(reason);

    const replacement = state.call('new');
    await expect(state.call('concurrent')).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    state.newProbe.resolve('replacement success');
    await expect(replacement).resolves.toBe('replacement success');
    state.oldProbe.reject(new Error('late abandoned work failure'));
    await Promise.resolve();
    expect(state.call('ready')).toBe('ready');
    expect(state.events.map(({ kind }) => kind)).toEqual([
      'circuit.open',
      'circuit.half_open',
      'circuit.half_open',
      'circuit.closed',
    ]);
  });
});
