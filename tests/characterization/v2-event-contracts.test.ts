import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PolicyEvent } from '../../src/core/events';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { keyedLock } from '../../src/operators/keyed-lock';
import { overlap } from '../../src/operators/overlap';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

type Args = readonly [id: string];

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function recordingContext(operationId: string, events: PolicyEvent[]) {
  return {
    operationId,
    metadata: { contract: 'v2' },
    eventSink: {
      emit(event: PolicyEvent): void {
        events.push(event);
      },
    },
  };
}

function sequence(events: PolicyEvent[]) {
  return events.map(({ kind, operationId }) => [kind, operationId]);
}

describe('v2 event contracts before the 2.1 refactors', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['drop', 'share', 'queue'] as const)(
    'preserves the exact overlap %s event sequence and caller correlation',
    async (mode) => {
      const active = deferred();
      const events: PolicyEvent[] = [];
      const receiver = {};
      const starts: string[] = [];
      const operation = pipe(
        function (id: string): string | Promise<string> {
          starts.push(id);
          return id === 'first' ? active.promise : id;
        },
        overlap<object, Args, string>({ mode, key: () => 'shared-key' }),
      );
      const first = run(receiver, ['first'], operation, recordingContext('first', events));
      const second = run(receiver, ['second'], operation, recordingContext('second', events));

      if (mode === 'drop') {
        await expect(second).rejects.toMatchObject({ code: 'OVERLAP_DROPPED' });
      }
      expect(starts).toEqual(['first']);
      active.resolve('result');
      await expect(first).resolves.toBe('result');
      if (mode !== 'drop') {
        await expect(second).resolves.toBe(mode === 'share' ? 'result' : 'second');
      }

      expect(sequence(events)).toEqual(
        mode === 'queue'
          ? [
              ['overlap.started', 'first'],
              ['overlap.queued', 'second'],
              ['overlap.completed', 'first'],
              ['overlap.started', 'second'],
              ['overlap.completed', 'second'],
            ]
          : mode === 'drop'
            ? [
                ['overlap.started', 'first'],
                ['overlap.dropped', 'second'],
                ['overlap.completed', 'first'],
              ]
            : [
                ['overlap.started', 'first'],
                ['overlap.completed', 'first'],
              ],
      );
      for (const event of events) {
        expect(event).toMatchObject({
          key: 'shared-key',
          operator: 'overlap',
          metadata: { contract: 'v2' },
        });
      }
    },
  );

  it('preserves keyedLock events when a queued caller aborts and frees capacity', async () => {
    const active = deferred();
    const events: PolicyEvent[] = [];
    const controller = new AbortController();
    const reason = new Error('cancel queued caller');
    const receiver = {};
    const starts: string[] = [];
    const operation = pipe(
      function (id: string): string | Promise<string> {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      keyedLock<object, Args, string>({ key: () => 'shared-key', maxQueue: 1 }),
    );
    const first = run(receiver, ['first'], operation, recordingContext('first', events));
    const cancelled = run(receiver, ['cancelled'], operation, {
      ...recordingContext('cancelled', events),
      signal: controller.signal,
    });
    controller.abort(reason);
    await expect(cancelled).rejects.toBe(reason);
    const last = run(receiver, ['last'], operation, recordingContext('last', events));

    active.resolve('result');
    await expect(first).resolves.toBe('result');
    await expect(last).resolves.toBe('last');
    expect(starts).toEqual(['first', 'last']);
    expect(sequence(events)).toEqual([
      ['keyedLock.acquired', 'first'],
      ['keyedLock.queued', 'cancelled'],
      ['keyedLock.queued', 'last'],
      ['keyedLock.released', 'first'],
      ['keyedLock.acquired', 'last'],
      ['keyedLock.released', 'last'],
    ]);
  });

  it('keeps CLOSED silent and emits OPEN/HALF_OPEN/OPEN before recovery', async () => {
    vi.useFakeTimers();
    const events: PolicyEvent[] = [];
    const failure = new Error('business failure');
    let failing = false;
    const operation = pipe(
      function (): string {
        if (failing) throw failure;
        return 'ok';
      },
      circuitBreaker<object, readonly [], string>({ failures: 1, resetMs: 100 }),
    );
    const context = recordingContext('breaker', events);

    expect(run({}, [], operation, context)).toBe('ok');
    expect(events).toEqual([]);
    failing = true;
    await expect(run({}, [], operation, context)).rejects.toBe(failure);
    await expect(run({}, [], operation, context)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(events.map(({ kind }) => kind)).toEqual(['circuit.open']);
    vi.advanceTimersByTime(100);
    await expect(run({}, [], operation, context)).rejects.toBe(failure);
    failing = false;
    vi.advanceTimersByTime(100);
    expect(run({}, [], operation, context)).toBe('ok');
    expect(events.map(({ kind }) => kind)).toEqual([
      'circuit.open',
      'circuit.half_open',
      'circuit.open',
      'circuit.half_open',
      'circuit.closed',
    ]);
  });
});
