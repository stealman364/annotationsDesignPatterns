import { afterEach, describe, expect, it, vi } from 'vitest';
import { cachedFor } from '../../src/operators/cached-for';
import { memoize } from '../../src/operators/memoize';

describe('v2 cache contracts before numeric validation and cancellation changes', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['memoize', 'cachedFor'] as const)(
    '%s shares its default argument cache across receivers',
    (kind) => {
      let calls = 0;
      const operator =
        kind === 'memoize'
          ? memoize<{ name: string }, readonly [], string>()
          : cachedFor<{ name: string }, readonly [], string>(1_000);
      const operation = operator.apply(function (this: { name: string }): string {
        calls += 1;
        return this.name;
      });
      expect(operation.call({ name: 'first' })).toBe('first');
      expect(operation.call({ name: 'second' })).toBe('first');
      expect(calls).toBe(1);
    },
  );

  it('treats functional cachedFor(0) as disabled caching', () => {
    vi.useFakeTimers();
    let calls = 0;
    const operation = cachedFor<object, readonly [], number>(0).apply(() => ++calls);
    expect(operation.call({})).toBe(1);
    expect(operation.call({})).toBe(2);
  });

  it('treats functional cachedFor(Infinity) as no expiration', () => {
    vi.useFakeTimers();
    let calls = 0;
    const operation = cachedFor<object, readonly [], number>(Infinity).apply(() => ++calls);
    expect(operation.call({})).toBe(1);
    vi.setSystemTime(Date.now() + 2 ** 32);
    expect(operation.call({})).toBe(1);
    expect(calls).toBe(1);
  });
});
