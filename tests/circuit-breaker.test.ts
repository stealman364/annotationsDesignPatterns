import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from '../src/patterns/utility/circuit-breaker';

describe('@CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre el circuito tras los fallos consecutivos configurados', async () => {
    let executions = 0;

    class Api {
      @CircuitBreaker({ failures: 2, resetMs: 1000 })
      async call(): Promise<string> {
        executions++;
        throw new Error('fallo del servicio');
      }
    }

    const api = new Api();
    await expect(api.call()).rejects.toThrow('fallo del servicio');
    await expect(api.call()).rejects.toThrow('fallo del servicio');
    await expect(api.call()).rejects.toThrow('Circuito abierto');
    expect(executions).toBe(2);
  });

  it('tras resetMs permite un intento y se cierra si tiene éxito', async () => {
    let shouldFail = true;

    class Api {
      @CircuitBreaker({ failures: 1, resetMs: 1000 })
      async call(): Promise<string> {
        if (shouldFail) {
          throw new Error('fallo');
        }
        return 'ok';
      }
    }

    const api = new Api();
    await expect(api.call()).rejects.toThrow('fallo');
    await expect(api.call()).rejects.toThrow('Circuito abierto');

    vi.advanceTimersByTime(1000);
    shouldFail = false;
    await expect(api.call()).resolves.toBe('ok');
    await expect(api.call()).resolves.toBe('ok');
  });

  it('un éxito reinicia el contador de fallos consecutivos', async () => {
    let attempt = 0;

    class Api {
      @CircuitBreaker({ failures: 2, resetMs: 1000 })
      async call(): Promise<string> {
        attempt++;
        if (attempt === 2) {
          return 'ok';
        }
        throw new Error('fallo');
      }
    }

    const api = new Api();
    await expect(api.call()).rejects.toThrow('fallo'); // fallo 1
    await expect(api.call()).resolves.toBe('ok'); // éxito: contador a 0
    await expect(api.call()).rejects.toThrow('fallo'); // fallo 1 de nuevo
    await expect(api.call()).rejects.toThrow('fallo'); // fallo 2: abre
    await expect(api.call()).rejects.toThrow('Circuito abierto');
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => CircuitBreaker({ failures: 0, resetMs: 1000 })).toThrow(RangeError);
    expect(() => CircuitBreaker({ failures: 1, resetMs: 0 })).toThrow(RangeError);
  });
});
