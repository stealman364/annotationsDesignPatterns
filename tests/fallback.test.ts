import { describe, expect, it } from 'vitest';
import { Fallback } from '../src/patterns/utility/fallback';

describe('@Fallback', () => {
  it('devuelve el valor de respaldo cuando el método rechaza', async () => {
    class Api {
      @Fallback('desconocido')
      async getName(id: number): Promise<string> {
        void id;
        throw new Error('sin conexión');
      }
    }

    await expect(new Api().getName(1)).resolves.toBe('desconocido');
  });

  it('no interviene si el método resuelve', async () => {
    class Api {
      @Fallback('desconocido')
      async getName(id: number): Promise<string> {
        return `user-${id}`;
      }
    }

    await expect(new Api().getName(2)).resolves.toBe('user-2');
  });

  it('acepta una función que recibe el error y los argumentos originales', async () => {
    class Api {
      @Fallback((error: unknown, id: number) => `fallback:${id}:${(error as Error).message}`)
      async getName(id: number): Promise<string> {
        void id;
        throw new Error('boom');
      }
    }

    await expect(new Api().getName(7)).resolves.toBe('fallback:7:boom');
  });

  it('la función de respaldo puede ser asíncrona', async () => {
    class Api {
      @Fallback(async () => 'respaldo-async')
      async getName(): Promise<string> {
        throw new Error('boom');
      }
    }

    await expect(new Api().getName()).resolves.toBe('respaldo-async');
  });

  it('conserva el receiver y los argumentos con un proveedor asíncrono', async () => {
    class Api {
      constructor(private readonly prefix: string) {}

      @Fallback(async (error: unknown, id: number) => {
        expect(error).toBeInstanceOf(Error);
        return `fallback:${id}`;
      })
      async getName(id: number): Promise<string> {
        throw new Error(`${this.prefix}:${id}`);
      }
    }

    await expect(new Api('api').getName(7)).resolves.toBe('fallback:7');
  });
});
