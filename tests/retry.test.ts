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

  it('rechaza configuraciones inválidas', () => {
    expect(() => Retry({ attempts: 0 })).toThrow(RangeError);
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

  it('rechaza backoffFactor menor que 1', () => {
    expect(() => Retry({ attempts: 2, backoffFactor: 0 })).toThrow(RangeError);
  });
});
