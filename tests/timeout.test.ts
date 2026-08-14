import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timeout } from '../src/patterns/utility/timeout';

describe('@Timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resuelve normalmente si el método termina a tiempo', async () => {
    vi.useFakeTimers();

    class Api {
      @Timeout(1000)
      async fast(): Promise<number> {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 42;
      }
    }

    const result = new Api().fast();

    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
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

  it('limpia el temporizador cuando el método rechaza antes del límite', async () => {
    vi.useFakeTimers();
    const reason = new Error('upstream failure');

    class Api {
      @Timeout(1000)
      async fails(): Promise<never> {
        throw reason;
      }
    }

    await expect(new Api().fails()).rejects.toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechaza al vencer el límite, limpia su temporizador y no cancela el trabajo subyacente', async () => {
    vi.useFakeTimers();
    let completed = false;

    class Api {
      @Timeout(100)
      async slow(): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 200));
        completed = true;
        return 'completed after timeout';
      }
    }

    const result = new Api().slow();
    const assertion = expect(result).rejects.toThrow('El método slow superó el límite de 100 ms');

    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(completed).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(completed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechaza límites no positivos', () => {
    expect(() => Timeout(0)).toThrow(RangeError);
    expect(() => Timeout(-1)).toThrow(RangeError);
  });
});
