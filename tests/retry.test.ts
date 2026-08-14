import { afterEach, describe, expect, it, vi } from 'vitest';
import { Retry } from '../src/patterns/utility/retry';

describe('@Retry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reintenta hasta que el método tiene éxito', async () => {
    let attempts = 0;

    class Api {
      @Retry({ attempts: 3 })
      async fetch(): Promise<string> {
        attempts++;
        if (attempts < 3) {
          throw new Error('fallo temporal');
        }
        return 'ok';
      }
    }

    await expect(new Api().fetch()).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('lanza el último error cuando se agotan los intentos', async () => {
    let attempts = 0;

    class Api {
      @Retry({ attempts: 2 })
      async fetch(): Promise<string> {
        attempts++;
        throw new Error(`fallo ${attempts}`);
      }
    }

    await expect(new Api().fetch()).rejects.toThrow('fallo 2');
    expect(attempts).toBe(2);
  });

  it('no reintenta si la primera llamada tiene éxito', async () => {
    let attempts = 0;

    class Api {
      @Retry({ attempts: 5 })
      async fetch(): Promise<number> {
        attempts++;
        return 42;
      }
    }

    await expect(new Api().fetch()).resolves.toBe(42);
    expect(attempts).toBe(1);
  });

  it.each([Number.NaN, Infinity, 0, -1])(
    'rechaza attempts no finito o menor que uno: %s',
    (attempts) => {
      expect(() => Retry({ attempts })).toThrow(RangeError);
    },
  );

  it.each([-1, Number.NaN, Infinity])('rechaza delayMs negativo o no finito: %s', (delayMs) => {
    expect(() => Retry({ attempts: 2, delayMs })).toThrow(RangeError);
  });

  it.each([0, -1, Number.NaN, Infinity])(
    'rechaza backoffFactor menor que uno o no finito: %s',
    (backoffFactor) => {
      expect(() => Retry({ attempts: 2, backoffFactor })).toThrow(RangeError);
    },
  );

  it('usa delayMs y backoffFactor por defecto válidos', async () => {
    let attempts = 0;

    class Api {
      @Retry({ attempts: 2 })
      async fetch(): Promise<string> {
        attempts++;
        if (attempts === 1) {
          throw new Error('fallo temporal');
        }
        return 'ok';
      }
    }

    await expect(new Api().fetch()).resolves.toBe('ok');
    expect(attempts).toBe(2);
  });

  it('aplica backoff exponencial entre intentos', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const timeline: number[] = [];
    const start = Date.now();

    class Api {
      @Retry({ attempts: 3, delayMs: 100, backoffFactor: 2 })
      async fetch(): Promise<string> {
        attempts++;
        timeline.push(Date.now() - start);
        throw new Error(`fallo ${attempts}`);
      }
    }

    const promise = new Api().fetch();
    const assertion = expect(promise).rejects.toThrow('fallo 3');
    await vi.advanceTimersByTimeAsync(100); // primera espera: 100 ms
    await vi.advanceTimersByTimeAsync(200); // segunda espera: 100 * 2 ms
    await assertion;

    expect(attempts).toBe(3);
    expect(timeline).toEqual([0, 100, 300]);
  });

  it('propaga exactamente el último valor lanzado de forma síncrona al agotar intentos', async () => {
    const firstFailure = { kind: 'first failure' };
    const lastFailure = { kind: 'last failure' };
    let attempts = 0;

    class Api {
      @Retry({ attempts: 2 })
      fetch(): Promise<never> {
        attempts++;
        throw attempts === 1 ? firstFailure : lastFailure;
      }
    }

    await expect(new Api().fetch()).rejects.toBe(lastFailure);
    expect(attempts).toBe(2);
  });

  it('propaga exactamente el último valor rechazado al agotar intentos', async () => {
    const firstFailure = { kind: 'first rejection' };
    const lastFailure = { kind: 'last rejection' };
    let attempts = 0;

    class Api {
      @Retry({ attempts: 2 })
      fetch(): Promise<never> {
        attempts++;
        return Promise.reject(attempts === 1 ? firstFailure : lastFailure);
      }
    }

    await expect(new Api().fetch()).rejects.toBe(lastFailure);
    expect(attempts).toBe(2);
  });
});
