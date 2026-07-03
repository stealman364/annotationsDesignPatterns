import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timeout } from '../src/patterns/utility/timeout';

describe('@Timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resuelve normalmente si el método termina a tiempo', async () => {
    class Api {
      @Timeout(1000)
      async fast(): Promise<number> {
        return 42;
      }
    }

    await expect(new Api().fast()).resolves.toBe(42);
  });

  it('rechaza cuando el método supera el límite', async () => {
    vi.useFakeTimers();

    class Api {
      @Timeout(100)
      async slow(): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 60000));
        return 'demasiado tarde';
      }
    }

    const promise = new Api().slow();
    const assertion = expect(promise).rejects.toThrow('El método slow superó el límite de 100 ms');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('rechaza límites no positivos', () => {
    expect(() => Timeout(0)).toThrow(RangeError);
    expect(() => Timeout(-1)).toThrow(RangeError);
  });
});
