# Fase 2: @Debounce, @Throttle, @Retry, @Lazy — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 1 completada (`npm test` en verde).

**Goal:** Cuatro decoradores de método con temporización o estado interno: `@Debounce` (agrupa llamadas), `@Throttle` (limita frecuencia), `@Retry` (reintenta métodos async) y `@Lazy` (getter calculado una sola vez).

**Architecture:** Igual que la Fase 1: un archivo por patrón en `src/patterns/`, export en `src/index.ts`. Estos decoradores son *factorías* — se usan con paréntesis: `@Debounce(100)`. El estado por instancia se guarda en `WeakMap` para no impedir la recolección de basura.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest con fake timers (`vi.useFakeTimers()` — también simula `Date.now()`).

---

### Task 1: @Debounce

**Files:**
- Create: `src/patterns/debounce.ts`
- Modify: `src/index.ts`
- Test: `tests/debounce.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/debounce.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Debounce } from '../src/patterns/debounce';

describe('@Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('solo ejecuta la última llamada dentro de la ventana', () => {
    const received: string[] = [];

    class Search {
      @Debounce(100)
      query(text: string): void {
        received.push(text);
      }
    }

    const s = new Search();
    s.query('a');
    s.query('ab');
    s.query('abc');
    expect(received).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(received).toEqual(['abc']);
  });

  it('cada instancia tiene su propio temporizador', () => {
    let calls = 0;

    class Widget {
      @Debounce(50)
      refresh(): void {
        calls++;
      }
    }

    const a = new Widget();
    const b = new Widget();
    a.refresh();
    b.refresh();
    vi.advanceTimersByTime(50);
    expect(calls).toBe(2);
  });

  it('rechaza retardos no positivos', () => {
    expect(() => Debounce(0)).toThrow(RangeError);
    expect(() => Debounce(-5)).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/debounce.test.ts`
Expected: FAIL — no existe `src/patterns/debounce.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/debounce.ts`:

```ts
/**
 * Retrasa la ejecución del método hasta que pasen `delayMs` milisegundos sin
 * nuevas llamadas; solo se ejecuta la última. El método debe devolver `void`
 * (el resultado se perdería al ser asíncrono).
 *
 * @example
 * ```ts
 * class Search {
 *   @Debounce(300)
 *   query(text: string): void { ... }
 * }
 * ```
 */
export function Debounce(delayMs: number) {
  if (delayMs <= 0) {
    throw new RangeError('@Debounce requiere un retardo mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@Debounce solo puede aplicarse a un método');
    }
    const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();
    return function (this: This, ...args: Args): void {
      const self = this as object;
      const pending = timers.get(self);
      if (pending !== undefined) {
        clearTimeout(pending);
      }
      timers.set(
        self,
        setTimeout(() => {
          timers.delete(self);
          target.call(this, ...args);
        }, delayMs)
      );
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/debounce.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Debounce } from './patterns/debounce';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Debounce"
```

- [x] **Step 5: Exportar, suite completa y commit** ✓ (completado)

### Task 2: @Throttle

**Files:**
- Create: `src/patterns/throttle.ts`
- Modify: `src/index.ts`
- Test: `tests/throttle.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/throttle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Throttle } from '../src/patterns/throttle';

describe('@Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ejecuta la primera llamada y descarta las siguientes dentro del intervalo', () => {
    let calls = 0;

    class Scroller {
      @Throttle(100)
      onScroll(): void {
        calls++;
      }
    }

    const s = new Scroller();
    s.onScroll();
    s.onScroll();
    s.onScroll();
    expect(calls).toBe(1);

    vi.advanceTimersByTime(100);
    s.onScroll();
    expect(calls).toBe(2);
  });

  it('cada instancia tiene su propio intervalo', () => {
    let calls = 0;

    class Widget {
      @Throttle(100)
      ping(): void {
        calls++;
      }
    }

    new Widget().ping();
    new Widget().ping();
    expect(calls).toBe(2);
  });

  it('rechaza intervalos no positivos', () => {
    expect(() => Throttle(0)).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/throttle.test.ts`
Expected: FAIL — no existe `src/patterns/throttle.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/throttle.ts`:

```ts
/**
 * Limita la frecuencia de ejecución: la primera llamada se ejecuta
 * inmediatamente y las siguientes se descartan hasta que pasen
 * `intervalMs` milisegundos.
 *
 * @example
 * ```ts
 * class Scroller {
 *   @Throttle(100)
 *   onScroll(): void { ... }
 * }
 * ```
 */
export function Throttle(intervalMs: number) {
  if (intervalMs <= 0) {
    throw new RangeError('@Throttle requiere un intervalo mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@Throttle solo puede aplicarse a un método');
    }
    const lastRun = new WeakMap<object, number>();
    return function (this: This, ...args: Args): void {
      const self = this as object;
      const now = Date.now();
      const previous = lastRun.get(self);
      if (previous !== undefined && now - previous < intervalMs) {
        return;
      }
      lastRun.set(self, now);
      target.call(this, ...args);
    };
  };
}
```

- [x] **Step 3: Implementación** ✓ (completado)

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/throttle.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Throttle } from './patterns/throttle';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Throttle"
```

- [x] **Step 5: Exportar, suite completa y commit** ✓ (completado)

### Task 3: @Retry

**Files:**
- Create: `src/patterns/retry.ts`
- Modify: `src/index.ts`
- Test: `tests/retry.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/retry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Retry } from '../src/patterns/retry';

describe('@Retry', () => {
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
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/retry.test.ts`
Expected: FAIL — no existe `src/patterns/retry.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/retry.ts`:

```ts
export interface RetryOptions {
  /** Número total de intentos (incluido el primero). Mínimo 1. */
  attempts: number;
  /** Espera entre intentos en milisegundos. Por defecto 0 (sin espera). */
  delayMs?: number;
}

/**
 * Reintenta un método asíncrono cuando lanza o rechaza, hasta agotar los
 * intentos. Si todos fallan, propaga el último error.
 *
 * @example
 * ```ts
 * class Api {
 *   @Retry({ attempts: 3, delayMs: 200 })
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Retry({ attempts, delayMs = 0 }: RetryOptions) {
  if (attempts < 1) {
    throw new RangeError('@Retry requiere al menos 1 intento');
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
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }
      throw lastError;
    };
  };
}
```

- [x] **Step 3: Implementación** ✓ (completado)

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/retry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Retry, type RetryOptions } from './patterns/retry';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Retry"
```

- [x] **Step 5: Exportar, suite completa y commit** ✓ (completado)

### Task 4: @Lazy

**Files:**
- Create: `src/patterns/lazy.ts`
- Modify: `src/index.ts`
- Test: `tests/lazy.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/lazy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Lazy } from '../src/patterns/lazy';

describe('@Lazy', () => {
  it('calcula el getter una sola vez por instancia', () => {
    let computations = 0;

    class Report {
      @Lazy
      get summary(): string {
        computations++;
        return 'resumen';
      }
    }

    const r = new Report();
    expect(r.summary).toBe('resumen');
    expect(r.summary).toBe('resumen');
    expect(computations).toBe(1);
  });

  it('cada instancia calcula su propio valor', () => {
    let next = 0;

    class Sequence {
      @Lazy
      get id(): number {
        return ++next;
      }
    }

    const a = new Sequence();
    const b = new Sequence();
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.id).toBe(1);
  });

  it('cachea también valores undefined', () => {
    let computations = 0;

    class Box {
      @Lazy
      get nothing(): undefined {
        computations++;
        return undefined;
      }
    }

    const box = new Box();
    expect(box.nothing).toBeUndefined();
    expect(box.nothing).toBeUndefined();
    expect(computations).toBe(1);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/lazy.test.ts`
Expected: FAIL — no existe `src/patterns/lazy.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/lazy.ts`:

```ts
/**
 * Evalúa el getter una sola vez por instancia y cachea el resultado
 * (incluidos `undefined` y `null`). Inicialización perezosa.
 *
 * @example
 * ```ts
 * class Report {
 *   @Lazy
 *   get summary(): string { return computeExpensiveSummary(); }
 * }
 * ```
 */
export function Lazy<This, Return>(
  target: (this: This) => Return,
  context: ClassGetterDecoratorContext<This, Return>
): (this: This) => Return {
  if (context.kind !== 'getter') {
    throw new TypeError('@Lazy solo puede aplicarse a un getter');
  }
  const cache = new WeakMap<object, Return>();
  const computed = new WeakSet<object>();
  return function (this: This): Return {
    const self = this as object;
    if (!computed.has(self)) {
      cache.set(self, target.call(this));
      computed.add(self);
    }
    return cache.get(self) as Return;
  };
}
```

- [x] **Step 3: Implementación** ✓ (completado)

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/lazy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final:

```ts
export { Lazy } from './patterns/lazy';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, `dist/patterns/` contiene los 4 patrones nuevos.

- [x] **Step 5: Exportar, suite completa, build y commit** ✓ (completado)

- [x] **Step 6: Invocar la skill `verify` y después commitear** ✓ (completado)

```bash
git add -A
git commit -m "feat: decorador @Lazy"
```

## Criterio de salida de la Fase 2

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- `@Debounce`, `@Throttle`, `@Retry` y `@Lazy` exportados desde `src/index.ts`.
- Todo commiteado. La Fase 3 puede empezar.
