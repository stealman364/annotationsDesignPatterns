# Fase 5a: @Once, @Deprecated, @Bind, @Timeout, @RateLimit — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 4 completada (`npm test` con 53 tests en verde).
> IMPORTANTE: desde la reorganización, los patrones viven en carpetas por categoría.
> Los cinco de esta fase van TODOS en `src/patterns/utility/`. Los tests siguen planos
> en `tests/`. Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`),
> sin añadir líneas nuevas.

**Goal:** Cinco decoradores utilitarios de método: `@Once` (ejecuta una sola vez), `@Deprecated` (aviso de obsolescencia), `@Bind` (auto-liga `this`), `@Timeout` (límite de tiempo para métodos async) y `@RateLimit` (máximo N llamadas por ventana).

**Architecture:** Igual que fases anteriores: un archivo por patrón, export agrupado en `src/index.ts` bajo el comentario `// Utilitarios de método`. Estado por instancia en `WeakMap`/`WeakSet`.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest con fake timers y `vi.spyOn`.

---

### Task 1: @Once

**Files:**
- Create: `src/patterns/utility/once.ts`
- Modify: `src/index.ts`
- Test: `tests/once.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/once.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Once } from '../src/patterns/utility/once';

describe('@Once', () => {
  it('ejecuta el método una sola vez y devuelve siempre el primer resultado', () => {
    let executions = 0;

    class Setup {
      @Once
      init(label: string): string {
        executions++;
        return `init:${label}`;
      }
    }

    const s = new Setup();
    expect(s.init('a')).toBe('init:a');
    expect(s.init('b')).toBe('init:a');
    expect(executions).toBe(1);
  });

  it('cada instancia ejecuta su propia vez', () => {
    let executions = 0;

    class Setup {
      @Once
      init(): number {
        return ++executions;
      }
    }

    const a = new Setup();
    const b = new Setup();
    expect(a.init()).toBe(1);
    expect(b.init()).toBe(2);
    expect(a.init()).toBe(1);
  });

  it('cachea también resultados undefined', () => {
    let executions = 0;

    class Job {
      @Once
      run(): undefined {
        executions++;
        return undefined;
      }
    }

    const j = new Job();
    expect(j.run()).toBeUndefined();
    expect(j.run()).toBeUndefined();
    expect(executions).toBe(1);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/once.test.ts`
Expected: FAIL — no existe `src/patterns/utility/once.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/once.ts`:

```ts
/**
 * Ejecuta el método una sola vez por instancia; las llamadas siguientes
 * devuelven el resultado de la primera (incluidos `undefined` y `null`)
 * ignorando los nuevos argumentos.
 *
 * @example
 * ```ts
 * class Setup {
 *   @Once
 *   init(): Config { ... } // solo se ejecuta la primera vez
 * }
 * ```
 */
export function Once<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Once solo puede aplicarse a un método');
  }
  const results = new WeakMap<object, Return>();
  const executed = new WeakSet<object>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    if (!executed.has(self)) {
      results.set(self, target.call(this, ...args));
      executed.add(self);
    }
    return results.get(self) as Return;
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/once.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Once } from './patterns/utility/once';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Once"
```

### Task 2: @Deprecated

**Files:**
- Create: `src/patterns/utility/deprecated.ts`
- Modify: `src/index.ts`
- Test: `tests/deprecated.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/deprecated.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deprecated } from '../src/patterns/utility/deprecated';

describe('@Deprecated', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avisa por console.warn solo la primera vez y el método sigue funcionando', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class Legacy {
      @Deprecated('usa newMethod()')
      oldMethod(): string {
        return 'ok';
      }
    }

    const l = new Legacy();
    expect(l.oldMethod()).toBe('ok');
    expect(l.oldMethod()).toBe('ok');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[deprecated] oldMethod: usa newMethod()');
  });

  it('usa un mensaje por defecto si no se indica ninguno', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class Legacy {
      @Deprecated()
      oldMethod(): void {}
    }

    new Legacy().oldMethod();
    expect(warn).toHaveBeenCalledWith('[deprecated] oldMethod: este método está obsoleto');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/deprecated.test.ts`
Expected: FAIL — no existe `src/patterns/utility/deprecated.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/deprecated.ts`:

```ts
/**
 * Marca el método como obsoleto: la primera vez que se usa (en total, no por
 * instancia) emite un aviso por `console.warn` y después ejecuta el método
 * con normalidad.
 *
 * @example
 * ```ts
 * class Api {
 *   @Deprecated('usa fetchUserV2()')
 *   fetchUser(id: string): User { ... }
 * }
 * ```
 */
export function Deprecated(message?: string) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Deprecated solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    let warned = false;
    return function (this: This, ...args: Args): Return {
      if (!warned) {
        warned = true;
        console.warn(`[deprecated] ${methodName}: ${message ?? 'este método está obsoleto'}`);
      }
      return target.call(this, ...args);
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/deprecated.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Deprecated } from './patterns/utility/deprecated';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Deprecated"
```

### Task 3: @Bind

**Files:**
- Create: `src/patterns/utility/bind.ts`
- Modify: `src/index.ts`
- Test: `tests/bind.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/bind.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Bind } from '../src/patterns/utility/bind';

describe('@Bind', () => {
  it('mantiene this al desestructurar el método', () => {
    class Counter {
      count = 0;

      @Bind
      increment(): number {
        return ++this.count;
      }
    }

    const counter = new Counter();
    const inc = counter.increment;
    expect(inc()).toBe(1);
    expect(inc()).toBe(2);
    expect(counter.count).toBe(2);
  });

  it('cada instancia liga su propio this', () => {
    class Counter {
      count = 0;

      @Bind
      increment(): number {
        return ++this.count;
      }
    }

    const a = new Counter();
    const b = new Counter();
    const incA = a.increment;
    const incB = b.increment;
    incA();
    incA();
    incB();
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
  });

  it('el método sigue funcionando llamado con normalidad', () => {
    class Greeter {
      name = 'Ana';

      @Bind
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter().greet()).toBe('Hola, Ana');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/bind.test.ts`
Expected: FAIL — no existe `src/patterns/utility/bind.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/bind.ts`:

```ts
/**
 * Liga el método a su instancia (`this`) al construirla, de modo que puede
 * desestructurarse o pasarse como callback sin perder el contexto.
 *
 * @example
 * ```ts
 * class Handler {
 *   @Bind
 *   onClick(): void { this.process(); }
 * }
 * button.addEventListener('click', new Handler().onClick); // this correcto
 * ```
 */
export function Bind<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
): void {
  if (context.kind !== 'method') {
    throw new TypeError('@Bind solo puede aplicarse a un método');
  }
  const methodName = context.name;
  context.addInitializer(function (this: This) {
    const method = (this as Record<PropertyKey, unknown>)[methodName] as (
      this: This,
      ...args: Args
    ) => Return;
    Object.defineProperty(this, methodName, {
      value: method.bind(this),
      writable: true,
      configurable: true,
    });
  });
  void target;
}
```

Nota: este decorador devuelve `void` (no reemplaza el método); trabaja con
`context.addInitializer`, que se ejecuta al construir cada instancia.

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/bind.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Bind } from './patterns/utility/bind';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Bind"
```

### Task 4: @Timeout

**Files:**
- Create: `src/patterns/utility/timeout.ts`
- Modify: `src/index.ts`
- Test: `tests/timeout.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/timeout.test.ts`:

```ts
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
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/timeout.test.ts`
Expected: FAIL — no existe `src/patterns/utility/timeout.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/timeout.ts`:

```ts
/**
 * Limita el tiempo de un método asíncrono: si no resuelve en `ms`
 * milisegundos, la promesa devuelta rechaza con `Error`. El método original
 * sigue ejecutándose en segundo plano (JavaScript no permite cancelarlo),
 * pero su resultado se descarta.
 *
 * @example
 * ```ts
 * class Api {
 *   @Timeout(5000)
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Timeout(ms: number) {
  if (ms <= 0) {
    throw new RangeError('@Timeout requiere un límite mayor que 0 ms');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Timeout solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return async function (this: This, ...args: Args): Promise<Return> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`El método ${methodName} superó el límite de ${ms} ms`)),
          ms
        );
      });
      try {
        return await Promise.race([target.call(this, ...args), limit]);
      } finally {
        clearTimeout(timer);
      }
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/timeout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Timeout } from './patterns/utility/timeout';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Timeout"
```

### Task 5: @RateLimit

**Files:**
- Create: `src/patterns/utility/rate-limit.ts`
- Modify: `src/index.ts`
- Test: `tests/rate-limit.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimit } from '../src/patterns/utility/rate-limit';

describe('@RateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite como máximo maxCalls por ventana y descarta el resto', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(2, 1000)
      send(): void {
        calls++;
      }
    }

    const n = new Notifier();
    n.send();
    n.send();
    n.send();
    expect(calls).toBe(2);

    vi.advanceTimersByTime(1000);
    n.send();
    expect(calls).toBe(3);
  });

  it('la ventana es deslizante: las llamadas antiguas van caducando', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(2, 1000)
      send(): void {
        calls++;
      }
    }

    const n = new Notifier();
    n.send(); // t=0
    vi.advanceTimersByTime(600);
    n.send(); // t=600
    n.send(); // t=600, descartada (2 en ventana)
    expect(calls).toBe(2);

    vi.advanceTimersByTime(500); // t=1100: la de t=0 ya caducó
    n.send();
    expect(calls).toBe(3);
  });

  it('cada instancia tiene su propio contador', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(1, 1000)
      send(): void {
        calls++;
      }
    }

    new Notifier().send();
    new Notifier().send();
    expect(calls).toBe(2);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => RateLimit(0, 1000)).toThrow(RangeError);
    expect(() => RateLimit(1, 0)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/rate-limit.test.ts`
Expected: FAIL — no existe `src/patterns/utility/rate-limit.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/rate-limit.ts`:

```ts
/**
 * Limita el método a `maxCalls` ejecuciones por ventana deslizante de
 * `windowMs` milisegundos, por instancia. Las llamadas que exceden el
 * límite se descartan en silencio. El método debe devolver `void`.
 * Generalización de @Throttle (que equivale a RateLimit(1, intervalo)).
 *
 * @example
 * ```ts
 * class Notifier {
 *   @RateLimit(5, 60_000) // máximo 5 avisos por minuto
 *   send(message: string): void { ... }
 * }
 * ```
 */
export function RateLimit(maxCalls: number, windowMs: number) {
  if (maxCalls < 1) {
    throw new RangeError('@RateLimit requiere al menos 1 llamada por ventana');
  }
  if (windowMs <= 0) {
    throw new RangeError('@RateLimit requiere una ventana mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@RateLimit solo puede aplicarse a un método');
    }
    const timestamps = new WeakMap<object, number[]>();
    return function (this: This, ...args: Args): void {
      const self = this as object;
      const now = Date.now();
      const recent = (timestamps.get(self) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxCalls) {
        timestamps.set(self, recent);
        return;
      }
      recent.push(now);
      timestamps.set(self, recent);
      target.call(this, ...args);
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/rate-limit.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { RateLimit } from './patterns/utility/rate-limit';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, `dist/patterns/utility/` contiene los 5 nuevos.

- [ ] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @RateLimit"
```

## Criterio de salida de la Fase 5a

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- `@Once`, `@Deprecated`, `@Bind`, `@Timeout` y `@RateLimit` exportados desde `src/index.ts`.
- Todo commiteado. La Fase 5b puede empezar.
