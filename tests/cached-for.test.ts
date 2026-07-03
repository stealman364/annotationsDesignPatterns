import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CachedFor } from '../src/patterns/utility/cached-for';

describe('@CachedFor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cachea dentro del TTL y recalcula cuando caduca', () => {
    let calls = 0;

    class Api {
      @CachedFor(1000)
      fetchValue(id: number): string {
        calls++;
        return `v${id}:${calls}`;
      }
    }

    const api = new Api();
    expect(api.fetchValue(1)).toBe('v1:1');
    expect(api.fetchValue(1)).toBe('v1:1');
    expect(calls).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(api.fetchValue(1)).toBe('v1:2');
    expect(calls).toBe(2);
  });

  it('distingue argumentos y mantiene una cache por instancia', () => {
    let calls = 0;

    class Api {
      @CachedFor(1000)
      get(id: number): number {
        void id;
        return ++calls;
      }
    }

    const a = new Api();
    const b = new Api();
    expect(a.get(1)).toBe(1);
    expect(a.get(2)).toBe(2);
    expect(a.get(1)).toBe(1);
    expect(b.get(1)).toBe(3);
  });

  it('rechaza TTL no positivos', () => {
    expect(() => CachedFor(0)).toThrow(RangeError);
    expect(() => CachedFor(-1)).toThrow(RangeError);
  });
});
