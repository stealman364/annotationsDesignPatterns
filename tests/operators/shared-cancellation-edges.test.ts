import { describe, expect, it, vi } from 'vitest';
import { SharedExecution } from '../../src/core/shared-execution';
import { cachedFor } from '../../src/operators/cached-for';
import { memoize } from '../../src/operators/memoize';
import { overlap } from '../../src/operators/overlap';
import { executionMethod, run } from '../../src/public/run';
import { pipe } from '../../src/public/pipe';

describe('shared execution edge cases', () => {
  it('does not join a pre-aborted consumer and lets a later consumer observe settlement', async () => {
    const execution = new SharedExecution<string>(() => undefined);
    const aborted = new AbortController();
    aborted.abort('already gone');

    await expect(execution.join(aborted.signal)).rejects.toBe('already gone');
    expect(execution.start(() => 'complete')).toBe('complete');
    await expect(execution.join()).resolves.toBe('complete');
  });

  it('detaches each signal listener when its execution settles', async () => {
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const add = vi.spyOn(caller.signal, 'addEventListener');
    const remove = vi.spyOn(caller.signal, 'removeEventListener');
    const waiting = execution.join(caller.signal);

    expect(add).toHaveBeenCalledOnce();
    expect(execution.start(() => 'done')).toBe('done');
    await expect(waiting).resolves.toBe('done');
    expect(remove).toHaveBeenCalledOnce();
    caller.abort('too late');
    await expect(waiting).resolves.toBe('done');
  });

  it('settles shared waiters when the initiating function throws synchronously', async () => {
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const waiting = execution.join(caller.signal);
    const failure = new Error('synchronous failure');

    expect(() =>
      execution.start(() => {
        throw failure;
      }),
    ).toThrow(failure);
    await expect(waiting).rejects.toBe(failure);
    expect(execution.signal.aborted).toBe(false);
  });

  it('reads a custom thenable getter once and preserves its thrown error', async () => {
    let reads = 0;
    const accessFailure = new Error('first access');
    const thenable = Object.defineProperty({}, 'then', {
      get() {
        reads++;
        if (reads === 1) throw accessFailure;
        return (resolve: (value: string) => void) => resolve('adopted');
      },
    });
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const waiting = execution.join(caller.signal);

    execution.start(() => thenable as PromiseLike<string>);
    await expect(waiting).rejects.toBe(accessFailure);
    expect(reads).toBe(1);
  });

  it('rejects waiters when the captured then method throws', async () => {
    const failure = new Error('then method failure');
    const thenable = {
      then() {
        throw failure;
      },
    };
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const waiting = execution.join(caller.signal);

    execution.start(() => thenable as unknown as PromiseLike<string>);
    await expect(waiting).rejects.toBe(failure);
  });

  it('preserves synchronous values whose then property is not callable', () => {
    const value = { then: 'not a function', result: 'sync' };
    const execution = new SharedExecution<typeof value>(() => undefined);

    expect(execution.start(() => value)).toBe(value);
  });

  it('keeps the first thenable settlement when then later throws', async () => {
    const thenable = {
      then(resolve: (value: string) => void) {
        resolve('resolved first');
        throw new Error('ignored after resolve');
      },
    };
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const waiting = execution.join(caller.signal);

    execution.start(() => thenable as unknown as PromiseLike<string>);
    await expect(waiting).resolves.toBe('resolved first');
  });
});

describe('cooperative cancellation option edges', () => {
  it('rejects non-boolean cancellation options', () => {
    expect(() => memoize({ cancelWhenUnused: 'yes' as never })).toThrow(/boolean/);
    expect(() => cachedFor(100, { cancelWhenUnused: 1 as never })).toThrow(/boolean/);
    expect(() =>
      overlap({ mode: 'share', key: () => 'k', cancelWhenUnused: 'yes' as never }),
    ).toThrow(/boolean/);
    expect(() => overlap({ mode: 'invalid' as never, key: () => 'k' })).toThrow(/mode/);
  });

  it('does not invoke overlap work if its key resolver aborts the caller', async () => {
    const caller = new AbortController();
    const reason = new Error('cancelled during key resolution');
    let calls = 0;
    const method = pipe(
      executionMethod(() => {
        calls++;
        return 'unexpected';
      }),
      overlap({
        mode: 'share',
        key: (context) => {
          context.signal?.addEventListener('abort', () => undefined);
          caller.abort(reason);
          return 'key';
        },
      }),
    );

    await expect(run({}, [], method, { signal: caller.signal })).rejects.toBe(reason);
    expect(calls).toBe(0);
  });
});
