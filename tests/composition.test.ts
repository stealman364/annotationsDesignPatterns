import { describe, expect, it } from 'vitest';
import { Fallback } from '../src/patterns/utility/fallback';
import { Retry } from '../src/patterns/utility/retry';
import { Timeout } from '../src/patterns/utility/timeout';
import { Validate } from '../src/patterns/utility/validate';
import { Memoize } from '../src/patterns/utility/memoize';
import { Singleton } from '../src/patterns/creational/singleton';
import { Frozen } from '../src/patterns/structural/frozen';

describe('composición de decoradores', () => {
  it('cadena de resiliencia: @Retry salva fallos transitorios sin llegar al @Fallback', async () => {
    let attempts = 0;

    class Api {
      @Fallback<string>('respaldo')
      @Retry({ attempts: 3 })
      @Timeout(1000)
      async fetch(): Promise<string> {
        attempts++;
        if (attempts < 3) {
          throw new Error('fallo transitorio');
        }
        return 'ok';
      }
    }

    await expect(new Api().fetch()).resolves.toBe('ok');
    expect(attempts).toBe(3);
  });

  it('cadena de resiliencia: agotados los reintentos entra el @Fallback', async () => {
    let attempts = 0;

    class Api {
      @Fallback<string>('respaldo')
      @Retry({ attempts: 2 })
      @Timeout(1000)
      async fetch(): Promise<string> {
        attempts++;
        throw new Error('fallo permanente');
      }
    }

    await expect(new Api().fetch()).resolves.toBe('respaldo');
    expect(attempts).toBe(2);
  });

  it('@Validate corta antes de que @Memoize cachee un argumento inválido', () => {
    let calls = 0;

    class Calc {
      @Validate((n: number) => n >= 0 || 'n debe ser >= 0')
      @Memoize
      sqrt(n: number): number {
        calls++;
        return Math.sqrt(n);
      }
    }

    const calc = new Calc();
    expect(() => calc.sqrt(-4)).toThrow('n debe ser >= 0');
    expect(calls).toBe(0);
    expect(calc.sqrt(9)).toBe(3);
    expect(calc.sqrt(9)).toBe(3);
    expect(calls).toBe(1);
  });

  it('@Singleton + @Frozen: instancia única e inmutable', () => {
    @Singleton
    @Frozen
    class Config {
      constructor(public env: string) {}
    }

    const a = new Config('prod');
    const b = new Config('dev');

    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      a.env = 'hack';
    }).toThrow(TypeError);
    expect(b.env).toBe('prod');
  });
});
