import { describe, expect, it } from 'vitest';
import { CachedFor } from '../../src/patterns/utility/cached-for';
import { Memoize } from '../../src/patterns/utility/memoize';

describe('caracterización de cache de rechazos', () => {
  it('@Memoize elimina una Promise rechazada para que el siguiente intento ejecute el método', async () => {
    const failure = new Error('unavailable');

    class Api {
      calls = 0;

      @Memoize
      load(id: string): Promise<string> {
        void id;
        this.calls++;
        return this.calls === 1 ? Promise.reject(failure) : Promise.resolve('available');
      }
    }

    const api = new Api();
    const first = api.load('profile');
    await expect(first).rejects.toBe(failure);

    await expect(api.load('profile')).resolves.toBe('available');
    expect(api.calls).toBe(2);
  });

  it('@Memoize conserva el valor exitoso escrito después de reintentar un rechazo', async () => {
    const failure = new Error('unavailable');

    class Api {
      calls = 0;

      @Memoize
      load(id: string): Promise<string> {
        void id;
        this.calls++;
        return this.calls === 1 ? Promise.reject(failure) : Promise.resolve('available');
      }
    }

    const api = new Api();
    await expect(api.load('profile')).rejects.toBe(failure);

    const fresh = api.load('profile');
    await expect(fresh).resolves.toBe('available');

    expect(api.load('profile')).toBe(fresh);
    expect(api.calls).toBe(2);
  });

  it('@CachedFor elimina una Promise rechazada para que el siguiente intento se ejecute antes de vencer el TTL', async () => {
    const failure = new Error('unavailable');

    class Api {
      calls = 0;

      @CachedFor(1_000)
      load(id: string): Promise<string> {
        void id;
        this.calls++;
        return this.calls === 1 ? Promise.reject(failure) : Promise.resolve('available');
      }
    }

    const api = new Api();
    const first = api.load('profile');
    await expect(first).rejects.toBe(failure);

    await expect(api.load('profile')).resolves.toBe('available');
    expect(api.calls).toBe(2);
  });
});
