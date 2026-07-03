# Fase 1: @Singleton, @Memoize, @Frozen — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 0 completada (`npm test` en verde).

**Goal:** Los tres primeros decoradores: `@Singleton` (instancia única), `@Memoize` (cache de resultados por método e instancia) y `@Frozen` (instancias inmutables).

**Architecture:** Un archivo por patrón en `src/patterns/`, re-exportado desde `src/index.ts`. Decoradores TC39 puros, sin estado global compartido entre patrones.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest.

---

### Task 1: @Singleton

**Files:**
- Create: `src/patterns/singleton.ts`
- Modify: `src/index.ts`
- Test: `tests/singleton.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/singleton.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Singleton } from '../src/patterns/singleton';

describe('@Singleton', () => {
  it('devuelve siempre la misma instancia', () => {
    @Singleton
    class Database {
      connections = 0;
    }

    const a = new Database();
    const b = new Database();
    a.connections = 5;

    expect(a).toBe(b);
    expect(b.connections).toBe(5);
  });

  it('conserva los argumentos de la primera construcción e ignora los siguientes', () => {
    @Singleton
    class Config {
      constructor(public env: string) {}
    }

    const first = new Config('prod');
    const second = new Config('dev');

    expect(first.env).toBe('prod');
    expect(second.env).toBe('prod');
  });

  it('preserva instanceof', () => {
    @Singleton
    class Service {}

    expect(new Service()).toBeInstanceOf(Service);
  });

  it('cada clase decorada tiene su propia instancia', () => {
    @Singleton
    class A {}
    @Singleton
    class B {}

    expect(new A()).not.toBe(new B());
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/singleton.test.ts`
Expected: FAIL — no existe `src/patterns/singleton.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/singleton.ts`:

```ts
/**
 * Convierte la clase en un singleton: todas las llamadas a `new` devuelven
 * la misma instancia. Los argumentos de construcciones posteriores a la
 * primera se ignoran.
 *
 * @example
 * ```ts
 * @Singleton
 * class Database {
 *   connect() { ... }
 * }
 * new Database() === new Database(); // true
 * ```
 */
export function Singleton<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Singleton solo puede aplicarse a una clase');
  }
  let instance: InstanceType<T> | undefined;
  return new Proxy(target, {
    construct(original, args, newTarget) {
      instance ??= Reflect.construct(original, args, newTarget) as InstanceType<T>;
      return instance;
    },
  });
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/singleton.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar desde el barrel**

En `src/index.ts`, añade al final:

```ts
export { Singleton } from './patterns/singleton';
```

- [x] **Step 6: Suite completa y commit**

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Singleton"
```

### Task 2: @Memoize

**Files:**
- Create: `src/patterns/memoize.ts`
- Modify: `src/index.ts`
- Test: `tests/memoize.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/memoize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Memoize } from '../src/patterns/memoize';

describe('@Memoize', () => {
  it('solo ejecuta el método una vez por combinación de argumentos', () => {
    let calls = 0;

    class Calculator {
      @Memoize
      square(n: number): number {
        calls++;
        return n * n;
      }
    }

    const calc = new Calculator();
    expect(calc.square(4)).toBe(16);
    expect(calc.square(4)).toBe(16);
    expect(calc.square(5)).toBe(25);
    expect(calls).toBe(2);
  });

  it('mantiene una cache separada por instancia', () => {
    let calls = 0;

    class Counter {
      @Memoize
      next(): number {
        return ++calls;
      }
    }

    const a = new Counter();
    const b = new Counter();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(1);
    expect(b.next()).toBe(2);
  });

  it('preserva el valor de this', () => {
    class Greeter {
      constructor(private name: string) {}

      @Memoize
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter('Ana').greet()).toBe('Hola, Ana');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/memoize.test.ts`
Expected: FAIL — no existe `src/patterns/memoize.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/memoize.ts`:

```ts
/**
 * Cachea el resultado del método por combinación de argumentos (clave
 * `JSON.stringify(args)`) y por instancia. Pensado para métodos puros.
 *
 * @example
 * ```ts
 * class Api {
 *   @Memoize
 *   expensiveComputation(n: number): number { ... }
 * }
 * ```
 */
export function Memoize<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Memoize solo puede aplicarse a un método');
  }
  const caches = new WeakMap<object, Map<string, Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let cache = caches.get(self);
    if (!cache) {
      cache = new Map<string, Return>();
      caches.set(self, cache);
    }
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key) as Return;
    }
    const result = target.call(this, ...args);
    cache.set(key, result);
    return result;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/memoize.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar desde el barrel**

En `src/index.ts`, añade al final:

```ts
export { Memoize } from './patterns/memoize';
```

- [x] **Step 6: Suite completa y commit**

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Memoize"
```

### Task 3: @Frozen

**Files:**
- Create: `src/patterns/frozen.ts`
- Modify: `src/index.ts`
- Test: `tests/frozen.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/frozen.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Frozen } from '../src/patterns/frozen';

describe('@Frozen', () => {
  it('congela las instancias tras construirlas', () => {
    @Frozen
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }

    const p = new Point(1, 2);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.x).toBe(1);
  });

  it('mutar una propiedad lanza TypeError (modo estricto)', () => {
    @Frozen
    class Point {
      constructor(public x: number) {}
    }

    const p = new Point(1);
    expect(() => {
      p.x = 99;
    }).toThrow(TypeError);
    expect(p.x).toBe(1);
  });

  it('preserva instanceof', () => {
    @Frozen
    class Value {}

    expect(new Value()).toBeInstanceOf(Value);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/frozen.test.ts`
Expected: FAIL — no existe `src/patterns/frozen.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/frozen.ts`:

```ts
/**
 * Congela (`Object.freeze`) cada instancia inmediatamente después de
 * construirla: las propiedades no pueden modificarse ni añadirse.
 * Nota: no uses @Frozen en clases pensadas para ser extendidas, porque
 * las subclases no podrán inicializar sus propios campos.
 *
 * @example
 * ```ts
 * @Frozen
 * class Point {
 *   constructor(public x: number, public y: number) {}
 * }
 * ```
 */
export function Frozen<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Frozen solo puede aplicarse a una clase');
  }
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const instance = Reflect.construct(original, args, newTarget) as object;
      return Object.freeze(instance);
    },
  });
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/frozen.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar desde el barrel**

En `src/index.ts`, añade al final:

```ts
export { Frozen } from './patterns/frozen';
```

- [ ] **Step 6: Suite completa, build y commit**

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: `dist/` contiene `index.*` y `patterns/singleton.*`, `patterns/memoize.*`, `patterns/frozen.*`.

- [ ] **Step 7: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @Frozen"
```

## Criterio de salida de la Fase 1

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- `@Singleton`, `@Memoize` y `@Frozen` exportados desde `src/index.ts`.
- Todo commiteado. Las Fases 2 y 3 pueden empezar.
