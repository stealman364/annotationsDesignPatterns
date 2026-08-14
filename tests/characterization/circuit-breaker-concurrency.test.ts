import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';

describe('characterization: B3 @CircuitBreaker half-open concurrency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite solo una sonda half-open mientras la primera sigue pendiente', async () => {
    const probeResolvers: Array<(value: string) => void> = [];
    let calls = 0;

    class Api {
      @CircuitBreaker({ failures: 1, resetMs: 100 })
      async call(): Promise<string> {
        calls++;
        if (calls === 1) {
          throw new Error('initial failure');
        }
        return new Promise((resolve) => {
          probeResolvers.push(resolve);
        });
      }
    }

    const api = new Api();
    await expect(api.call()).rejects.toThrow('initial failure');
    vi.advanceTimersByTime(100);

    const firstProbe = api.call();
    const secondProbe = api.call();

    expect(calls).toBe(2);
    expect(probeResolvers).toHaveLength(1);
    await expect(secondProbe).rejects.toThrow('Circuito abierto');
    for (const resolve of probeResolvers) {
      resolve('ok');
    }
    await expect(firstProbe).resolves.toBe('ok');
  });
});
