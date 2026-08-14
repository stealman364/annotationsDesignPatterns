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

  it('acepta un resolver de clave personalizado', () => {
    let calls = 0;

    class Repo {
      @CachedFor(1000, { key: (user: { id: number }) => String(user.id) })
      load(user: { id: number }): number {
        void user;
        return ++calls;
      }
    }

    const repo = new Repo();
    expect(repo.load({ id: 7 })).toBe(1);
    expect(repo.load({ id: 7 })).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(repo.load({ id: 7 })).toBe(2);
  });

  it('conserva una entrada nueva si una Promise caducada se rechaza después', async () => {
    const failure = new Error('unavailable');
    let rejectFirst!: (reason: Error) => void;
    let calls = 0;

    class Api {
      @CachedFor(1_000)
      load(id: string): Promise<string> {
        void id;
        calls++;
        if (calls === 1) {
          return new Promise((_, reject) => {
            rejectFirst = reject;
          });
        }
        return Promise.resolve('fresh');
      }
    }

    const api = new Api();
    const expired = api.load('profile');
    vi.advanceTimersByTime(1_000);
    const replacement = api.load('profile');

    rejectFirst(failure);
    await expect(expired).rejects.toBe(failure);
    await expect(replacement).resolves.toBe('fresh');

    expect(api.load('profile')).toBe(replacement);
    expect(calls).toBe(2);
  });

  it('rechaza TTL no positivos', () => {
    expect(() => CachedFor(0)).toThrow(RangeError);
    expect(() => CachedFor(-1)).toThrow(RangeError);
  });
});
