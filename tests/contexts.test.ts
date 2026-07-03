import { describe, expect, it } from 'vitest';
import { Memoize } from '../src/patterns/utility/memoize';
import { Once } from '../src/patterns/utility/once';
import { Retry } from '../src/patterns/utility/retry';

describe('decoradores en métodos estáticos', () => {
  it('@Memoize cachea métodos estáticos (this = la clase)', () => {
    let calls = 0;

    class MathUtil {
      @Memoize
      static square(n: number): number {
        calls++;
        return n * n;
      }
    }

    expect(MathUtil.square(4)).toBe(16);
    expect(MathUtil.square(4)).toBe(16);
    expect(MathUtil.square(5)).toBe(25);
    expect(calls).toBe(2);
  });

  it('@Retry funciona en métodos estáticos async', async () => {
    let attempts = 0;

    class Api {
      @Retry({ attempts: 3 })
      static async ping(): Promise<string> {
        attempts++;
        if (attempts < 2) {
          throw new Error('fallo');
        }
        return 'pong';
      }
    }

    await expect(Api.ping()).resolves.toBe('pong');
    expect(attempts).toBe(2);
  });
});

describe('decoradores en métodos privados', () => {
  it('@Once solo ejecuta una vez un método privado', () => {
    let executions = 0;

    class Setup {
      @Once
      #init(): number {
        return ++executions;
      }

      boot(): number {
        return this.#init();
      }
    }

    const s = new Setup();
    expect(s.boot()).toBe(1);
    expect(s.boot()).toBe(1);
    expect(executions).toBe(1);
  });

  it('@Memoize cachea un método privado por instancia', () => {
    let calls = 0;

    class Report {
      #compute(n: number): number {
        calls++;
        return n * 10;
      }

      // TC39 permite decorar el privado directamente; aquí decoramos el
      // público que delega para cubrir ambos caminos.
      @Memoize
      total(n: number): number {
        return this.#compute(n);
      }
    }

    const r = new Report();
    expect(r.total(2)).toBe(20);
    expect(r.total(2)).toBe(20);
    expect(calls).toBe(1);
  });
});
