import { describe, expect, it, vi } from 'vitest';
import type { EventSink } from '../../src/core/events';
import { memoize } from '../../src/operators/memoize';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

describe('direct EventSink failure isolation', () => {
  it('observes an accidentally returned rejecting thenable without changing the sync result', async () => {
    const then = vi.fn((_resolve: unknown, reject: (error: unknown) => void) =>
      reject(new Error('observer')),
    );
    const eventSink: EventSink = { emit: () => ({ then }) };
    const value = { business: 'ok' };
    const method = pipe(() => value, memoize());
    expect(run({}, [], method, { eventSink })).toBe(value);
    await Promise.resolve();
    expect(then).toHaveBeenCalledTimes(1);
  });

  it.each(['null', 'number', 'function', 'getter'])(
    'isolates an observer return %s',
    async (kind) => {
      const returned =
        kind === 'null'
          ? null
          : kind === 'number'
            ? 1
            : kind === 'function'
              ? () => undefined
              : {
                  get then() {
                    throw new Error('then accessor');
                  },
                };
      const eventSink: EventSink = { emit: () => returned };
      const method = pipe(() => 'ok', memoize());
      expect(run({}, [], method, { eventSink })).toBe('ok');
      await Promise.resolve();
    },
  );

  it('isolates a native async sink rejection without making the business result asynchronous', async () => {
    const eventSink: EventSink = {
      async emit() {
        throw new Error('async observer');
      },
    };
    const method = pipe(() => 7, memoize());
    expect(run({}, [], method, { eventSink })).toBe(7);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});
