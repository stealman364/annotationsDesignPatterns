# Mejora: resolver de clave (`key`) en @Memoize y @CachedFor — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: endurecimiento v1.4 completado (`npm test` con 127 tests en verde,
> `npm run lint` y `npm run format:check` en verde).
> Las dos tasks SOBRESCRIBEN archivos existentes con el contenido completo que da el
> plan, y AÑADEN tests al final de archivos de test existentes (se indica el ancla).
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`).

**Goal:** Opción `key` para sustituir la clave `JSON.stringify(args)` por un resolver del usuario: `@Memoize({ key: (user) => user.id })` y `@CachedFor(ttl, { key })`. Retrocompatible: `@Memoize` sin paréntesis y `@CachedFor(ttl)` siguen funcionando exactamente igual (los tests existentes no se tocan y deben pasar).

**Architecture:** `@Memoize` pasa a tener sobrecarga doble (decorador directo o factoría con opciones) con la lógica compartida en una función interna `memoizeMethod`. `@CachedFor` gana un segundo parámetro opcional. El tipo `KeyResolver` usa `(...args: never[]) => string` a propósito: hace que cualquier función que devuelva string sea asignable sin romper la inferencia de los genéricos del método (mismo truco que `@Fallback`).

**Tech Stack:** TypeScript 5 (decoradores TC39, sobrecargas), vitest.

---

### Task 1: @Memoize con opciones

**Files:**
- Modify: `src/patterns/utility/memoize.ts` (sobrescribir COMPLETO)
- Modify: `tests/memoize.test.ts` (añadir un describe al final)
- Modify: `src/index.ts` (ampliar una línea de export)

- [x] **Step 1: Añadir los tests que fallan**

En `tests/memoize.test.ts`, añade AL FINAL DEL ARCHIVO (después del cierre `});` del
`describe('@Memoize', ...)` existente) este bloque:

```ts

describe('@Memoize con resolver de clave', () => {
  it('usa la clave personalizada: literales distintos con el mismo id comparten entrada', () => {
    let calls = 0;

    class Repo {
      @Memoize({ key: (user: { id: number }) => String(user.id) })
      permissions(user: { id: number }): number {
        void user;
        return ++calls;
      }
    }

    const repo = new Repo();
    expect(repo.permissions({ id: 1 })).toBe(1);
    expect(repo.permissions({ id: 1 })).toBe(1);
    expect(repo.permissions({ id: 2 })).toBe(2);
    expect(calls).toBe(2);
  });

  it('la clave personalizada admite argumentos circulares (JSON.stringify lanzaría)', () => {
    interface Node {
      name: string;
      self?: Node;
    }
    let calls = 0;

    class Walker {
      @Memoize({ key: (node: Node) => node.name })
      visit(node: Node): number {
        void node;
        return ++calls;
      }
    }

    const node: Node = { name: 'a' };
    node.self = node;

    const w = new Walker();
    expect(w.visit(node)).toBe(1);
    expect(w.visit(node)).toBe(1);
    expect(calls).toBe(1);
  });

  it('@Memoize() sin opciones equivale al comportamiento por defecto', () => {
    let calls = 0;

    class Calc {
      @Memoize()
      double(n: number): number {
        void n;
        return ++calls;
      }
    }

    const c = new Calc();
    expect(c.double(1)).toBe(1);
    expect(c.double(1)).toBe(1);
    expect(calls).toBe(1);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/memoize.test.ts`
Expected: FAIL — los 3 tests antiguos pasan; los nuevos fallan (la forma con opciones
no existe todavía). Nota: puede fallar en transformación/typecheck del archivo; es el
rojo esperado.

- [x] **Step 3: Sobrescribir la implementación**

Sobrescribe `src/patterns/utility/memoize.ts` COMPLETO con:

```ts
/** Resolver de clave de cache: recibe los argumentos del método y devuelve la clave. */
export type KeyResolver = (...args: never[]) => string;

export interface MemoizeOptions {
  /**
   * Genera la clave de cache a partir de los argumentos, en sustitución del
   * `JSON.stringify(args)` por defecto. Tipa sus parámetros manualmente: el
   * compilador no los cruza con los del método decorado.
   */
  key?: KeyResolver;
}

/**
 * Cachea el resultado del método por combinación de argumentos y por
 * instancia. Pensado para métodos puros. Puede usarse directo (`@Memoize`)
 * o con opciones (`@Memoize({ key })`).
 *
 * La clave por defecto es `JSON.stringify(args)`, con limitaciones:
 * - lanza con argumentos que contengan referencias circulares;
 * - las funciones y los `Symbol` se serializan como nada (`undefined`),
 *   así que argumentos distintos pueden COLISIONAR en la misma entrada;
 * - `{a:1, b:2}` y `{b:2, a:1}` generan claves distintas (el orden de las
 *   propiedades importa).
 * Para esos casos, aporta tu propio resolver con la opción `key`.
 *
 * @example
 * ```ts
 * class Api {
 *   @Memoize
 *   expensiveComputation(n: number): number { ... }
 *
 *   @Memoize({ key: (user: User) => user.id })
 *   permissions(user: User): Permission[] { ... }
 * }
 * ```
 */
export function Memoize<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return;
export function Memoize(
  options?: MemoizeOptions,
): <This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
) => (this: This, ...args: Args) => Return;
export function Memoize(targetOrOptions?: unknown, maybeContext?: unknown): unknown {
  if (typeof targetOrOptions === 'function' && maybeContext !== undefined) {
    return memoizeMethod(
      targetOrOptions as (this: object, ...args: unknown[]) => unknown,
      maybeContext as ClassMethodDecoratorContext<
        object,
        (this: object, ...args: unknown[]) => unknown
      >,
      undefined,
    );
  }
  const options = (targetOrOptions ?? {}) as MemoizeOptions;
  return <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ) => memoizeMethod(target, context, options.key as ((...args: Args) => string) | undefined);
}

function memoizeMethod<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  key: ((...args: Args) => string) | undefined,
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Memoize solo puede aplicarse a un método');
  }
  const computeKey = key ?? ((...args: Args) => JSON.stringify(args));
  const caches = new WeakMap<object, Map<string, Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let cache = caches.get(self);
    if (!cache) {
      cache = new Map<string, Return>();
      caches.set(self, cache);
    }
    const cacheKey = computeKey(...args);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as Return;
    }
    const result = target.call(this, ...args);
    cache.set(cacheKey, result);
    return result;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/memoize.test.ts`
Expected: PASS (6 tests: 3 antiguos + 3 nuevos).

- [x] **Step 5: Ampliar el export, suite completa y commit**

En `src/index.ts`, sustituye la línea:

```ts
export { Memoize } from './patterns/utility/memoize';
```

por:

```ts
export { Memoize, type KeyResolver, type MemoizeOptions } from './patterns/utility/memoize';
```

Run: `npm test` — Expected: PASS (los 127 previos + 3 nuevos).
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: opcion key (resolver de clave) en @Memoize"
```

### Task 2: @CachedFor con opciones

**Files:**
- Modify: `src/patterns/utility/cached-for.ts` (sobrescribir COMPLETO)
- Modify: `tests/cached-for.test.ts` (añadir un test dentro del describe existente)
- Modify: `src/index.ts` (ampliar una línea de export)

- [x] **Step 1: Añadir el test que falla**

En `tests/cached-for.test.ts`, añade este test DENTRO del
`describe('@CachedFor', ...)` existente, justo ANTES del test
`it('rechaza TTL no positivos', ...)` (así usa los fake timers del `beforeEach`):

```ts
  it('acepta un resolver de clave personalizado', () => {
    let calls = 0;

    class Repo {
      @CachedFor(1000, { key: (user: { id: number }) => String(user.id) })
      load(user: { id: number }): number {
        void user;
        return ++calls;
      }
    }

    const repo = new Repo();
    expect(repo.load({ id: 7 })).toBe(1);
    expect(repo.load({ id: 7 })).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(repo.load({ id: 7 })).toBe(2);
  });

```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/cached-for.test.ts`
Expected: FAIL — los 3 tests antiguos pasan; el nuevo falla (el segundo parámetro no
existe todavía).

- [x] **Step 3: Sobrescribir la implementación**

Sobrescribe `src/patterns/utility/cached-for.ts` COMPLETO con:

```ts
import type { KeyResolver } from './memoize';

export interface CachedForOptions {
  /**
   * Genera la clave de cache a partir de los argumentos, en sustitución del
   * `JSON.stringify(args)` por defecto. Tipa sus parámetros manualmente: el
   * compilador no los cruza con los del método decorado.
   */
  key?: KeyResolver;
}

/**
 * Como @Memoize pero con caducidad: cachea el resultado por combinación de
 * argumentos y por instancia durante `ttlMs` milisegundos; después vuelve a
 * ejecutar el método.
 *
 * La clave por defecto es `JSON.stringify(args)` y comparte las limitaciones
 * de @Memoize (circulares lanzan, funciones/`Symbol` colisionan, el orden de
 * propiedades genera claves distintas); para esos casos aporta tu propio
 * resolver con la opción `key`.
 *
 * @example
 * ```ts
 * class Api {
 *   @CachedFor(60_000) // cache de 1 minuto
 *   fetchConfig(env: string): Config { ... }
 *
 *   @CachedFor(60_000, { key: (user: User) => user.id })
 *   loadProfile(user: User): Profile { ... }
 * }
 * ```
 */
export function CachedFor(ttlMs: number, options: CachedForOptions = {}) {
  if (ttlMs <= 0) {
    throw new RangeError('@CachedFor requiere un TTL mayor que 0 ms');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@CachedFor solo puede aplicarse a un método');
    }
    const computeKey =
      (options.key as ((...args: Args) => string) | undefined) ??
      ((...args: Args) => JSON.stringify(args));
    const caches = new WeakMap<object, Map<string, { value: Return; expiresAt: number }>>();
    return function (this: This, ...args: Args): Return {
      const self = this as object;
      let cache = caches.get(self);
      if (!cache) {
        cache = new Map<string, { value: Return; expiresAt: number }>();
        caches.set(self, cache);
      }
      const cacheKey = computeKey(...args);
      const entry = cache.get(cacheKey);
      const now = Date.now();
      if (entry && now < entry.expiresAt) {
        return entry.value;
      }
      const value = target.call(this, ...args);
      cache.set(cacheKey, { value, expiresAt: now + ttlMs });
      return value;
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/cached-for.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Ampliar el export, suite completa, lint, build y commit**

En `src/index.ts`, sustituye la línea:

```ts
export { CachedFor } from './patterns/utility/cached-for';
```

por:

```ts
export { CachedFor, type CachedForOptions } from './patterns/utility/cached-for';
```

Run: `npm test` — Expected: PASS (131 tests).
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run format` — aplica el formato.
Run: `npm run lint` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: opcion key (resolver de clave) en @CachedFor"
```

## Criterio de salida

- `npm test` (131 tests), `npm run typecheck`, `npm run lint`, `npm run format:check`
  y `npm run build` en verde.
- `@Memoize` sin paréntesis y `@CachedFor(ttl)` intactos (retrocompatibilidad).
- Exports nuevos: `KeyResolver`, `MemoizeOptions`, `CachedForOptions`.
- Todo commiteado.
