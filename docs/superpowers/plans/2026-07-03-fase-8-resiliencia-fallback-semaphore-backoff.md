# Fase 8: Resiliencia — @Fallback, @Semaphore, backoff en @Retry — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 6 completada (`npm test` con 107 tests en verde).
> Los tres cambios van en `src/patterns/utility/`. Los tests van planos en `tests/`.
> La Task 3 MODIFICA archivos existentes (`retry.ts` y `retry.test.ts`): el plan da el
> contenido COMPLETO final de ambos; sobrescríbelos tal cual.
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`), sin añadir
> líneas nuevas.

**Goal:** Completar el toolkit de resiliencia: `@Fallback` (valor o función de respaldo cuando un método async falla), `@Semaphore(n)` (máximo N ejecuciones concurrentes por instancia, patrón Bulkhead) y backoff exponencial opcional para el `@Retry` existente (`backoffFactor`, retrocompatible).

**Architecture:** Igual que fases anteriores. `@Semaphore` generaliza la mecánica de cola de promesas de `@Mutex`. El cambio de `@Retry` es retrocompatible: sin `backoffFactor` se comporta exactamente igual que hasta ahora (los 4 tests existentes deben seguir pasando sin tocarlos).

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest con fake timers (`advanceTimersByTimeAsync` para promesas).

---

### Task 1: @Fallback

**Files:**
- Create: `src/patterns/utility/fallback.ts`
- Modify: `src/index.ts`
- Test: `tests/fallback.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/fallback.test.ts`:

```ts
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
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/fallback.test.ts`
Expected: FAIL — no existe `src/patterns/utility/fallback.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/fallback.ts`:

```ts
/**
 * Si el método asíncrono rechaza, devuelve el valor de respaldo en lugar de
 * propagar el error. El respaldo puede ser un valor directo o una función
 * `(error, ...argsOriginales) => valor | Promise<valor>` (las funciones se
 * tratan SIEMPRE como proveedor, nunca como valor).
 *
 * Nota de tipado: `fallback` se tipa como `unknown` porque las factorías de
 * decoradores fijan sus genéricos antes de conocer el método decorado; es
 * responsabilidad del llamante que el respaldo sea compatible con el tipo
 * de retorno. Combínalo con @Retry/@Timeout/@CircuitBreaker para completar
 * la cadena de resiliencia.
 *
 * @example
 * ```ts
 * class Api {
 *   @Fallback([])
 *   async fetchItems(): Promise<Item[]> { ... }
 *
 *   @Fallback((error, id: string) => cache.get(id))
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Fallback(fallback: unknown) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Fallback solo puede aplicarse a un método');
    }
    return async function (this: This, ...args: Args): Promise<Return> {
      try {
        return await target.call(this, ...args);
      } catch (error) {
        const value =
          typeof fallback === 'function'
            ? await (fallback as (error: unknown, ...args: Args) => unknown)(error, ...args)
            : fallback;
        return value as Return;
      }
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/fallback.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Fallback } from './patterns/utility/fallback';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Fallback"
```

### Task 2: @Semaphore

**Files:**
- Create: `src/patterns/utility/semaphore.ts`
- Modify: `src/index.ts`
- Test: `tests/semaphore.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/semaphore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Semaphore } from '../src/patterns/utility/semaphore';

describe('@Semaphore', () => {
  it('limita las ejecuciones simultáneas a maxConcurrent', async () => {
    let active = 0;
    let maxActive = 0;

    class Downloader {
      @Semaphore(2)
      async download(id: number): Promise<void> {
        void id;
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        await Promise.resolve();
        active--;
      }
    }

    const d = new Downloader();
    await Promise.all([d.download(1), d.download(2), d.download(3), d.download(4)]);
    expect(maxActive).toBe(2);
    expect(active).toBe(0);
  });

  it('con límite 1 serializa como @Mutex', async () => {
    const order: string[] = [];

    class Db {
      @Semaphore(1)
      async write(id: number): Promise<void> {
        order.push(`start:${id}`);
        await Promise.resolve();
        order.push(`end:${id}`);
      }
    }

    const db = new Db();
    await Promise.all([db.write(1), db.write(2)]);
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('un fallo libera el hueco', async () => {
    class Job {
      @Semaphore(1)
      async run(fail: boolean): Promise<string> {
        if (fail) {
          throw new Error('boom');
        }
        return 'ok';
      }
    }

    const j = new Job();
    await expect(j.run(true)).rejects.toThrow('boom');
    await expect(j.run(false)).resolves.toBe('ok');
  });

  it('rechaza límites no positivos', () => {
    expect(() => Semaphore(0)).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/semaphore.test.ts`
Expected: FAIL — no existe `src/patterns/utility/semaphore.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/semaphore.ts`:

```ts
/**
 * Limita a `maxConcurrent` las ejecuciones simultáneas del método asíncrono
 * en la misma instancia (patrón Bulkhead); las llamadas que exceden el
 * límite esperan en cola FIFO. Generaliza @Mutex (que equivale a
 * Semaphore(1)). Un fallo libera el hueco con normalidad.
 *
 * @example
 * ```ts
 * class Downloader {
 *   @Semaphore(3) // máximo 3 descargas a la vez
 *   async download(url: string): Promise<Blob> { ... }
 * }
 * ```
 */
export function Semaphore(maxConcurrent: number) {
  if (maxConcurrent < 1) {
    throw new RangeError('@Semaphore requiere al menos 1 ejecución concurrente');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Semaphore solo puede aplicarse a un método');
    }
    const states = new WeakMap<object, { active: number; queue: Array<() => void> }>();
    return async function (this: This, ...args: Args): Promise<Return> {
      const self = this as object;
      let state = states.get(self);
      if (!state) {
        state = { active: 0, queue: [] };
        states.set(self, state);
      }
      const s = state;
      if (s.active >= maxConcurrent) {
        await new Promise<void>((resolve) => s.queue.push(resolve));
      }
      s.active++;
      try {
        return await target.call(this, ...args);
      } finally {
        s.active--;
        s.queue.shift()?.();
      }
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/semaphore.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Semaphore } from './patterns/utility/semaphore';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Semaphore (patrón Bulkhead)"
```

### Task 3: Backoff exponencial en @Retry (MODIFICA archivos existentes)

**Files:**
- Modify: `src/patterns/utility/retry.ts` (sobrescribir con el contenido completo de abajo)
- Modify: `tests/retry.test.ts` (sobrescribir con el contenido completo de abajo)

- [x] **Step 1: Sobrescribir los tests (los 4 existentes se conservan + 2 nuevos)**

Sobrescribe `tests/retry.test.ts` COMPLETO con:

```ts
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
```

- [x] **Step 2: Ejecutar y verificar que los tests nuevos fallan**

Run: `npx vitest run tests/retry.test.ts`
Expected: FAIL — los 4 tests antiguos pasan, pero fallan los 2 nuevos
(`backoffFactor` no existe todavía; el test de validación no lanza y el de
backoff no respeta los tiempos).

- [x] **Step 3: Sobrescribir la implementación**

Sobrescribe `src/patterns/utility/retry.ts` COMPLETO con:

```ts
export interface RetryOptions {
  /** Número total de intentos (incluido el primero). Mínimo 1. */
  attempts: number;
  /** Espera antes del primer reintento en milisegundos. Por defecto 0 (sin espera). */
  delayMs?: number;
  /**
   * Multiplicador de la espera entre reintentos (backoff exponencial):
   * la espera n vale `delayMs * backoffFactor^(n-1)`. Por defecto 1
   * (espera fija, comportamiento original). Mínimo 1.
   */
  backoffFactor?: number;
}

/**
 * Reintenta un método asíncrono cuando lanza o rechaza, hasta agotar los
 * intentos. Si todos fallan, propaga el último error. Con `backoffFactor`
 * la espera crece exponencialmente entre reintentos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Retry({ attempts: 4, delayMs: 200, backoffFactor: 2 }) // 200, 400, 800 ms
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Retry({ attempts, delayMs = 0, backoffFactor = 1 }: RetryOptions) {
  if (attempts < 1) {
    throw new RangeError('@Retry requiere al menos 1 intento');
  }
  if (backoffFactor < 1) {
    throw new RangeError('@Retry requiere un backoffFactor mayor o igual que 1');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Retry solo puede aplicarse a un método');
    }
    return async function (this: This, ...args: Args): Promise<Return> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await target.call(this, ...args);
        } catch (error) {
          lastError = error;
          if (attempt < attempts && delayMs > 0) {
            const wait = delayMs * backoffFactor ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, wait));
          }
        }
      }
      throw lastError;
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/retry.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Suite completa, build y commit**

`src/index.ts` NO cambia en esta task (`Retry` y `RetryOptions` ya estaban exportados).

Run: `npm test` — Expected: PASS (los 107 tests previos + 8 nuevos de la fase = 115).
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, con `fallback.*` y `semaphore.*` en `dist/patterns/utility/`.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: backoff exponencial opcional en @Retry"
```

## Criterio de salida de la Fase 8

- `npm test` (115 tests), `npm run typecheck` y `npm run build` en verde.
- Nuevos exports en `src/index.ts`: `Fallback`, `Semaphore`. `RetryOptions` acepta `backoffFactor`.
- Los 4 tests originales de `@Retry` pasan sin modificar su lógica (retrocompatibilidad).
- Todo commiteado.
