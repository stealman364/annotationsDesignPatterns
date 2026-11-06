import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cachedFor,
  cachedForWithHandle,
  type CachedForOperatorOptions,
} from '../../src/operators/cached-for';
import {
  memoize,
  memoizeWithHandle,
  type MemoizeOperatorOptions,
} from '../../src/operators/memoize';
import type { PolicyEvent } from '../../src/core/events';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

type Args = readonly [key: string];

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe.each(['memoize', 'cachedFor'] as const)('%s perReceiver', (kind) => {
  const create = () =>
    kind === 'memoize'
      ? memoize<object, Args, number>({ perReceiver: true })
      : cachedFor<object, Args, number>(Infinity, { perReceiver: true });

  it('isolates different objects and function receivers but reuses each partition', () => {
    let calls = 0;
    const operation = create().apply(() => ++calls);
    const a = {},
      b = {},
      fn = () => undefined;
    expect(operation.call(a, 'key')).toBe(1);
    expect(operation.call(b, 'key')).toBe(2);
    expect(operation.call(fn, 'key')).toBe(3);
    expect(operation.call(a, 'key')).toBe(1);
    expect(operation.call(b, 'key')).toBe(2);
    expect(operation.call(fn, 'key')).toBe(3);
  });

  it.each([undefined, null, 0, 'text', true, Symbol('receiver'), 1n])(
    'rejects invalid receiver %s explicitly',
    (receiver) => {
      const operation = create().apply(() => 1);
      expect(() => Reflect.apply(operation, receiver, ['key'])).toThrow(TypeError);
      expect(() => Reflect.apply(operation, receiver, ['key'])).toThrow(/object receiver/);
    },
  );

  it('preserves caller cancellation isolation within one receiver', async () => {
    const pending = deferred();
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    const operator =
      kind === 'memoize'
        ? memoize<object, Args, string>({ perReceiver: true })
        : cachedFor<object, Args, string>(Infinity, { perReceiver: true });
    let calls = 0;
    const operation = pipe<object, Args, string>(() => {
      calls++;
      return pending.promise;
    }, operator);
    const receiver = {};
    const a = run(receiver, ['key'], operation, { signal: controller.signal });
    const b = run(receiver, ['key'], operation, {});
    controller.abort(reason);
    await expect(a).rejects.toBe(reason);
    pending.resolve('ok');
    await expect(b).resolves.toBe('ok');
    expect(calls).toBe(1);
  });
});

describe('handle cache receiver policy', () => {
  it.each(['memoize', 'cachedFor'] as const)(
    '%s handles cannot acquire receiver partitions through later option mutation',
    (kind) => {
      const options = { key: (key: string) => key, perReceiver: false };
      const cache =
        kind === 'memoize'
          ? memoizeWithHandle<object, Args, number>(options)
          : cachedForWithHandle<object, Args, number>(Infinity, options);
      options.perReceiver = true;
      let calls = 0;
      const operation = cache.operator.apply(() => ++calls);
      const receiver = {};
      expect(operation.call(receiver, 'key')).toBe(1);
      cache.handle.invalidate('key');
      expect(operation.call(receiver, 'key')).toBe(2);
      cache.handle.clear();
      expect(operation.call(receiver, 'key')).toBe(3);
      expect(operation.call({}, 'key')).toBe(3);
    },
  );

  it.each(['memoize', 'cachedFor'] as const)(
    '%s snapshots the perReceiver flag but keeps legacy key capture at apply',
    (kind) => {
      const options = {
        perReceiver: true,
        key: (_key: string) => {
          void _key;
          return 'initial';
        },
      };
      const operator =
        kind === 'memoize'
          ? memoize<object, Args, number>(options)
          : cachedFor<object, Args, number>(Infinity, options);
      options.perReceiver = false;
      options.key = (key: string) => key;
      let calls = 0;
      const operation = operator.apply(() => ++calls);
      const receiver = {};
      expect(operation.call(receiver, 'first')).toBe(1);
      expect(operation.call({}, 'first')).toBe(2);
      expect(operation.call(receiver, 'second')).toBe(3);
    },
  );

  it.each(['true', 1, 0, null, {}, []].map((value) => [value] as const))(
    'rejects a malformed perReceiver flag %s at construction',
    (value) => {
      const memoOptions = { perReceiver: value } as unknown as MemoizeOperatorOptions<Args>;
      const ttlOptions = { perReceiver: value } as unknown as CachedForOperatorOptions<Args>;
      expect(() => memoize(memoOptions)).toThrow(TypeError);
      expect(() => cachedFor(100, ttlOptions)).toThrow(TypeError);
      expect(() => memoizeWithHandle(memoOptions)).toThrow(TypeError);
      expect(() => cachedForWithHandle(100, ttlOptions)).toThrow(TypeError);
    },
  );

  it('rejects runtime perReceiver requests from structurally assignable old options variables', () => {
    const memoOptions: MemoizeOperatorOptions<Args> = { key: (key) => key, perReceiver: true };
    const ttlOptions: CachedForOperatorOptions<Args> = { key: (key) => key, perReceiver: true };
    expect(() => memoizeWithHandle(memoOptions)).toThrow(/perReceiver/);
    expect(() => cachedForWithHandle(100, ttlOptions)).toThrow(/perReceiver/);
    expect(() =>
      memoizeWithHandle({ ...memoOptions, perReceiver: false } as MemoizeOperatorOptions<Args>),
    ).not.toThrow();
    expect(() =>
      cachedForWithHandle(100, {
        ...ttlOptions,
        perReceiver: false,
      } as CachedForOperatorOptions<Args>),
    ).not.toThrow();
  });

  it('does not expose perReceiver on handle factory object-literal options', () => {
    const checkTypes = (): void => {
      // @ts-expect-error Receiver partitions require a separate handle design.
      memoizeWithHandle({ perReceiver: true });
      // @ts-expect-error Receiver partitions require a separate handle design.
      cachedForWithHandle(100, { perReceiver: true });
    };
    void checkTypes;
  });
});

describe('bounded cachedFor', () => {
  afterEach(() => vi.useRealTimers());

  it.each([0, 2])('snapshots maxEntries before it is mutated to %s', (replacementLimit) => {
    const options = { maxEntries: 1, perReceiver: true };
    const operator = cachedFor<object, Args, number>(Infinity, options);
    options.maxEntries = replacementLimit;
    let calls = 0;
    const operation = operator.apply(() => ++calls);
    const receiver = {};
    expect(operation.call(receiver, 'a')).toBe(1);
    expect(operation.call(receiver, 'b')).toBe(2);
    expect(operation.call(receiver, 'a')).toBe(3);
  });

  it('snapshots a handle capacity and preserves its key capture timing', () => {
    const options = {
      maxEntries: 1,
      key: (_key: string) => {
        void _key;
        return 'initial';
      },
    };
    const cache = cachedForWithHandle<object, Args, number>(Infinity, options);
    options.maxEntries = 0;
    options.key = (key: string) => key;
    let calls = 0;
    const operation = cache.operator.apply(() => ++calls);
    expect(operation.call({}, 'a')).toBe(1);
    expect(operation.call({}, 'b')).toBe(2);
    expect(operation.call({}, 'a')).toBe(3);
  });

  it.each([NaN, -Infinity, Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxEntries %s',
    (maxEntries) => {
      expect(() => cachedFor(100, { maxEntries })).toThrow(RangeError);
      expect(() => cachedForWithHandle(100, { maxEntries })).toThrow(RangeError);
    },
  );

  it('evicts FIFO rather than reordering on hits and emits the existing invalidation event', () => {
    const events: PolicyEvent[] = [];
    const { operator } = cachedForWithHandle<object, Args, number>(Infinity, {
      maxEntries: 2,
      key: (key) => key,
    });
    let calls = 0;
    const operation = pipe<object, Args, number>(() => ++calls, operator);
    const context = { eventSink: { emit: (event: PolicyEvent) => events.push(event) } };
    expect(run({}, ['a'], operation, context)).toBe(1);
    expect(run({}, ['b'], operation, context)).toBe(2);
    expect(run({}, ['a'], operation, context)).toBe(1);
    expect(run({}, ['c'], operation, context)).toBe(3);
    expect(events.filter(({ kind }) => kind === 'cache.invalidated')).toEqual([
      expect.objectContaining({ kind: 'cache.invalidated', operator: 'cachedFor', key: 'a' }),
    ]);
    expect(run({}, ['b'], operation, context)).toBe(2);
    expect(run({}, ['a'], operation, context)).toBe(4);
  });

  it('applies capacity per receiver partition', () => {
    let calls = 0;
    const operation = cachedFor<object, Args, number>(Infinity, {
      maxEntries: 1,
      perReceiver: true,
    }).apply(() => ++calls);
    const a = {},
      b = {};
    expect(operation.call(a, 'first')).toBe(1);
    expect(operation.call(b, 'first')).toBe(2);
    expect(operation.call(a, 'second')).toBe(3);
    expect(operation.call(b, 'first')).toBe(2);
    expect(operation.call(a, 'first')).toBe(4);
  });

  it('shares the capacity and invalidation handle across applications of one WithHandle operator', () => {
    let calls = 0;
    const cache = cachedForWithHandle<object, Args, number>(Infinity, {
      maxEntries: 1,
      key: (key) => key,
    });
    const a = cache.operator.apply(() => ++calls),
      b = cache.operator.apply(() => ++calls);
    expect(a.call({}, 'first')).toBe(1);
    expect(b.call({}, 'first')).toBe(1);
    expect(b.call({}, 'second')).toBe(2);
    expect(a.call({}, 'first')).toBe(3);
    cache.handle.invalidate('first');
    expect(b.call({}, 'first')).toBe(4);
    cache.handle.clear();
    expect(a.call({}, 'first')).toBe(5);
    expect('size' in cache.handle).toBe(false);
  });

  it('silently prunes expired untouched entries on a bounded miss without timers', () => {
    vi.useFakeTimers();
    const events: PolicyEvent[] = [];
    const cache = cachedForWithHandle<object, Args, string>(10, {
      maxEntries: 2,
      key: (key) => key,
    });
    const operation = pipe((key: string) => key, cache.operator);
    const context = { eventSink: { emit: (event: PolicyEvent) => events.push(event) } };
    run({}, ['expired'], operation, context);
    vi.advanceTimersByTime(5);
    run({}, ['live'], operation, context);
    vi.advanceTimersByTime(5);
    run({}, ['new'], operation, context);
    expect(events.some(({ kind }) => kind === 'cache.invalidated')).toBe(false);
    cache.handle.clear();
    expect(
      events
        .filter(({ kind }) => kind === 'cache.invalidated')
        .map((event) => ('key' in event ? event.key : undefined)),
    ).toEqual(['live', 'new']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('counts pending entries, preserves evicted consumers, and ignores their stale rejection', async () => {
    const stale = deferred();
    let calls = 0;
    const operation = cachedFor<object, Args, string>(Infinity, { maxEntries: 1 }).apply((key) => {
      calls++;
      return calls === 1 ? stale.promise : Promise.resolve(key);
    });
    const old = operation.call({}, 'same');
    await expect(operation.call({}, 'other')).resolves.toBe('other');
    const replacement = operation.call({}, 'same');
    expect(calls).toBe(3);
    await expect(replacement).resolves.toBe('same');
    const failure = new Error('old failure');
    stale.reject(failure);
    await expect(old).rejects.toBe(failure);
    await expect(operation.call({}, 'same')).resolves.toBe('same');
    expect(calls).toBe(3);
  });

  it('keeps the capacity invariant during an eviction sink that inserts reentrantly', () => {
    const events: PolicyEvent[] = [];
    const cache = cachedForWithHandle<object, Args, string>(Infinity, {
      maxEntries: 1,
      key: (key) => key,
    });
    const operation = pipe((key: string) => key, cache.operator);
    let reentered = false;
    const context = {
      eventSink: {
        emit(event: PolicyEvent) {
          events.push(event);
          if (event.kind === 'cache.invalidated' && !reentered) {
            reentered = true;
            run({}, ['reentrant'], operation, context);
          }
        },
      },
    };
    run({}, ['first'], operation, context);
    run({}, ['second'], operation, context);
    expect(
      events
        .filter(({ kind }) => kind === 'cache.invalidated')
        .map((event) => ('key' in event ? event.key : undefined)),
    ).toEqual(['first', 'second']);
    events.length = 0;
    cache.handle.clear();
    expect(events.filter(({ kind }) => kind === 'cache.invalidated')).toHaveLength(1);
    expect(events[0]).toMatchObject({ key: 'reentrant' });
  });

  it('retains only the configured cardinality after a hundred unique keys', () => {
    const events: PolicyEvent[] = [];
    const cache = cachedForWithHandle<object, Args, string>(Infinity, {
      maxEntries: 3,
      key: (key) => key,
    });
    const operation = pipe((key: string) => key, cache.operator);
    const context = { eventSink: { emit: (event: PolicyEvent) => events.push(event) } };
    for (let index = 0; index < 100; index++) run({}, [`key-${index}`], operation, context);
    expect(events.filter(({ kind }) => kind === 'cache.invalidated')).toHaveLength(97);
    events.length = 0;
    cache.handle.clear();
    expect(events.map((event) => ('key' in event ? event.key : undefined))).toEqual([
      'key-97',
      'key-98',
      'key-99',
    ]);
  });

  it('allows evicted pending consumers to resolve independently', async () => {
    const pending = deferred();
    const operation = cachedFor<object, Args, string>(Infinity, { maxEntries: 1 }).apply((key) =>
      key === 'pending' ? pending.promise : key,
    );
    const old = operation.call({}, 'pending');
    expect(operation.call({}, 'other')).toBe('other');
    pending.resolve('original result');
    await expect(old).resolves.toBe('original result');
    expect(operation.call({}, 'other')).toBe('other');
  });
});
