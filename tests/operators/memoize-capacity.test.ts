import { describe, expect, it } from 'vitest';
import { memoize, memoizeWithHandle } from '../../src/operators/memoize';
import { pipe } from '../../src/public/pipe';

type Args = readonly [key: string];

describe('bounded memoize', () => {
  it('evicts FIFO without moving a hit and keeps pending consumers alive', async () => {
    let calls = 0;
    const pending = new Map<string, Promise<string>>();
    const operation = memoize<object, Args, string>({
      maxEntries: 2,
      key: (key) => key,
    }).apply((key) => {
      calls += 1;
      if (key === 'pending') {
        const value = new Promise<string>(() => undefined);
        pending.set(key, value);
        return value;
      }
      return `${key}:${calls}`;
    });

    expect(operation.call({}, 'a')).toBe('a:1');
    expect(operation.call({}, 'b')).toBe('b:2');
    expect(operation.call({}, 'a')).toBe('a:1');
    const firstPending = operation.call({}, 'pending');
    expect(firstPending).toBe(pending.get('pending'));
    expect(operation.call({}, 'a')).toBe('a:4');
    expect(operation.call({}, 'pending')).toBe(firstPending);
    expect(calls).toBe(4);
  });

  it('does not let a rejected evicted promise remove its replacement', async () => {
    let rejectFirst!: (reason: unknown) => void;
    let calls = 0;
    const operation = memoize<object, Args, string>({ maxEntries: 1, key: (key) => key }).apply(
      (key) => {
        calls += 1;
        if (calls === 1) return new Promise<string>((_resolve, reject) => (rejectFirst = reject));
        return Promise.resolve(`${key}:${calls}`);
      },
    );

    const stale = operation.call({}, 'same');
    operation.call({}, 'other');
    const replacement = operation.call({}, 'same');
    rejectFirst(new Error('stale rejection'));
    await expect(stale).rejects.toThrow('stale rejection');
    await expect(operation.call({}, 'same')).resolves.toBe('same:3');
    expect(operation.call({}, 'same')).toBe(replacement);
  });

  it('applies capacity independently to each receiver partition', () => {
    let calls = 0;
    const operation = memoize<object, Args, number>({
      key: (key) => key,
      perReceiver: true,
      maxEntries: 1,
    }).apply(() => ++calls);
    const first = {};
    const second = {};

    expect(operation.call(first, 'a')).toBe(1);
    expect(operation.call(second, 'a')).toBe(2);
    expect(operation.call(first, 'a')).toBe(1);
    expect(operation.call(second, 'b')).toBe(3);
    expect(operation.call(first, 'a')).toBe(1);
  });

  it('bounds a handle-owned cache across operator applications', () => {
    let calls = 0;
    const cache = memoizeWithHandle<object, Args, number>({ maxEntries: 1, key: (key) => key });
    const operation = pipe<object, Args, number>(() => ++calls, cache.operator);

    expect(operation.call({}, 'a')).toBe(1);
    expect(operation.call({}, 'b')).toBe(2);
    expect(operation.call({}, 'a')).toBe(3);
    cache.handle.invalidate('a');
    expect(operation.call({}, 'a')).toBe(4);
  });

  it.each([NaN, Infinity, -Infinity, -1, 0, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'validates maxEntries at factory construction for %s',
    (maxEntries) => {
      expect(() => memoize({ maxEntries })).toThrow(RangeError);
      expect(() => memoizeWithHandle({ maxEntries })).toThrow(RangeError);
    },
  );

  it('snapshots capacity at factory creation and leaves an unbounded cache unbounded', () => {
    const options = { maxEntries: 1 };
    const bounded = memoize<object, Args, string>(options);
    options.maxEntries = 0;
    let calls = 0;
    const operation = bounded.apply(() => String(++calls));
    expect(operation.call({}, 'a')).toBe('1');
    expect(operation.call({}, 'b')).toBe('2');
    expect(operation.call({}, 'a')).toBe('3');

    let unboundedCalls = 0;
    const unbounded = memoize<object, Args, number>().apply(() => ++unboundedCalls);
    unbounded.call({}, 'a');
    unbounded.call({}, 'b');
    expect(unbounded.call({}, 'a')).toBe(1);
  });
});
