import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoize, memoizeWithHandle } from '../../src/operators/memoize';
import { cachedFor, cachedForWithHandle } from '../../src/operators/cached-for';
import { overlap } from '../../src/operators/overlap';
import { fallback } from '../../src/operators/fallback';
import { retry } from '../../src/operators/retry';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { timeout, TimeoutError } from '../../src/operators/timeout';
import { executionMethod, run } from '../../src/public/run';
import { pipe } from '../../src/public/pipe';
import type { Operator } from '../../src/core/operator';

type Op = Operator<object, readonly [], string, string>;
const shared = (kind: string): Op =>
  kind === 'memoize'
    ? memoize({ cancelWhenUnused: true })
    : kind === 'cachedFor'
      ? cachedFor(1000, { cancelWhenUnused: true })
      : overlap({ mode: 'share', key: () => 'key', cancelWhenUnused: true });

describe.each(['memoize', 'cachedFor', 'overlap'])('%s opt-in shared cancellation', (kind) => {
  afterEach(() => vi.useRealTimers());

  it('preserves synchronous business failures and prioritizes a caller abort during failure', async () => {
    const failure = new Error('sync');
    const direct = pipe(() => {
      throw failure;
    }, shared(kind));
    expect(() => direct.call({})).toThrow(failure);
    const caller = new AbortController();
    const reason = new Error('left during business');
    const aborting = pipe(() => {
      caller.abort(reason);
      throw failure;
    }, shared(kind));
    await expect(run({}, [], aborting, { signal: caller.signal })).rejects.toBe(reason);
  });

  it('reserves before a synchronous reentrant join and retains a sync initiating result', async () => {
    let calls = 0;
    let joined: unknown;
    const method: () => string | PromiseLike<string> = pipe(() => {
      calls++;
      if (calls === 1) joined = method();
      return 'ok';
    }, shared(kind));
    expect(method()).toBe('ok');
    await expect(joined).resolves.toBe('ok');
    expect(calls).toBe(1);
  });

  it('retires before an abort listener calls the pipeline again', async () => {
    let calls = 0;
    let replacement: unknown;
    let replacementSignal: AbortSignal | undefined;
    const method = pipe(
      executionMethod((execution) => {
        calls++;
        const signal = execution.signal!;
        if (calls === 1)
          signal.addEventListener('abort', () => {
            replacement = method.call({});
          });
        else replacementSignal = signal;
        return calls === 1 ? new Promise<string>(() => undefined) : Promise.resolve('new');
      }),
      shared(kind),
    );
    const caller = new AbortController();
    const first = run({}, [], method, { signal: caller.signal });
    caller.abort('left');
    await expect(first).rejects.toBe('left');
    await expect(replacement).resolves.toBe('new');
    expect(calls).toBe(2);
    expect(replacementSignal!.aborted).toBe(false);
  });

  it('aborts only after the last consumer leaves and starts a fresh replacement', async () => {
    const signals: AbortSignal[] = [];
    const method = pipe(
      executionMethod((execution) => {
        const signal = execution.signal!;
        signals.push(signal);
        return new Promise<string>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        );
      }),
      shared(kind),
    );
    const first = new AbortController();
    const second = new AbortController();
    const a = run({}, [], method, { signal: first.signal });
    const b = run({}, [], method, { signal: second.signal });
    first.abort('first');
    await expect(a).rejects.toBe('first');
    expect(signals[0]!.aborted).toBe(false);
    second.abort('second');
    await expect(b).rejects.toBe('second');
    expect(signals[0]!.aborted).toBe(true);
    const third = new AbortController();
    const c = run({}, [], method, { signal: third.signal });
    expect(signals).toHaveLength(2);
    expect(signals[1]!.aborted).toBe(false);
    third.abort('third');
    await expect(c).rejects.toBe('third');
  });

  it('keeps a consumer without a signal alive and preserves synchronous values', async () => {
    let resolve!: (value: string) => void;
    let signal: AbortSignal | undefined;
    const method = pipe(
      executionMethod((execution) => {
        signal = execution.signal;
        return new Promise<string>((done) => {
          resolve = done;
        });
      }),
      shared(kind),
    );
    const controller = new AbortController();
    const a = run({}, [], method, { signal: controller.signal });
    const b = method.call({});
    controller.abort('gone');
    await expect(a).rejects.toBe('gone');
    expect(signal!.aborted).toBe(false);
    resolve('ok');
    await expect(b).resolves.toBe('ok');
    expect(pipe(() => 'sync', shared(kind)).call({})).toBe('sync');
  });

  it('suppresses recovery and breaker failure for shared abandonment through a timeout scope', async () => {
    const events: string[] = [];
    let calls = 0;
    const method = pipe(
      executionMethod(() => {
        calls++;
        return new Promise<string>(() => undefined);
      }),
      shared(kind),
      timeout(10000),
      fallback('recovered'),
      retry({ attempts: 2 }),
      circuitBreaker({ failures: 1, resetMs: 100 }),
    );
    const controller = new AbortController();
    const result = run({}, [], method, {
      signal: controller.signal,
      eventSink: { emit: (event) => events.push(event.kind) },
    });
    controller.abort('left');
    await expect(result).rejects.toBe('left');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
    expect(events).not.toContain('fallback.used');
    expect(events).not.toContain('circuit.open');
    expect(events).not.toContain('retry.exhausted');
  });

  it('continues treating an internal timeout as an error', async () => {
    vi.useFakeTimers();
    const method = pipe(() => new Promise<string>(() => undefined), shared(kind), timeout(10));
    const waiting = method.call({});
    const assertion = expect(waiting).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });
});

describe.each(['memoize', 'cachedFor'])('%s cooperative cache handles', (kind) => {
  it('does not begin shared work when key resolution aborts the caller', async () => {
    const caller = new AbortController();
    let calls = 0;
    const options = {
      cancelWhenUnused: true,
      key: () => {
        caller.abort('key abort');
        return 'key';
      },
    };
    const operator: Op = kind === 'memoize' ? memoize(options) : cachedFor(1000, options);
    const method = pipe(() => {
      calls++;
      return 'unused';
    }, operator);
    await expect(run({}, [], method, { signal: caller.signal })).rejects.toBe('key abort');
    expect(calls).toBe(0);
  });
  it('invalidation keeps old consumers and late retirement cannot remove a replacement', async () => {
    const cache =
      kind === 'memoize'
        ? memoizeWithHandle<object, readonly [], string>({ cancelWhenUnused: true })
        : cachedForWithHandle<object, readonly [], string>(1000, { cancelWhenUnused: true });
    const signals: AbortSignal[] = [];
    const resolves: Array<(value: string) => void> = [];
    const method = pipe(
      executionMethod((execution) => {
        signals.push(execution.signal!);
        return new Promise<string>((resolve) => resolves.push(resolve));
      }),
      cache.operator,
    );
    const caller = new AbortController();
    const old = run({}, [], method, { signal: caller.signal });
    cache.handle.clear();
    expect(signals[0]!.aborted).toBe(false);
    const fresh = method.call({});
    caller.abort('old left');
    await expect(old).rejects.toBe('old left');
    expect(signals[1]!.aborted).toBe(false);
    const joined = method.call({});
    expect(signals).toHaveLength(2);
    resolves[0]!('late old');
    resolves[1]!('fresh');
    await expect(fresh).resolves.toBe('fresh');
    await expect(joined).resolves.toBe('fresh');
    await expect(Promise.resolve(method.call({}))).resolves.toBe('fresh');
    expect(signals).toHaveLength(2);
  });
});

it('rejects cooperative cancellation outside overlap share mode', () => {
  expect(() => overlap({ mode: 'queue', key: () => 'key', cancelWhenUnused: true })).toThrow();
  expect(() => overlap({ mode: 'drop', key: () => 'key', cancelWhenUnused: true })).toThrow();
});
