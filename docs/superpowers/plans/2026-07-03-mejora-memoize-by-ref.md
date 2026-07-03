# Mejora: @MemoizeByRef (memoización por identidad) — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: mejora key-resolver completada (`npm test` con 131 tests en verde,
> `npm run lint` y `npm run format:check` en verde).
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`).

**Goal:** Nuevo decorador `@MemoizeByRef`: memoiza comparando los argumentos por IDENTIDAD (referencia), no por serialización. Sin `JSON.stringify`: nada colisiona ni lanza con circulares, y las entradas cuyos argumentos objeto mueren se liberan solas (WeakMap).

**Architecture:** Trie de nodos por instancia: cada nivel del árbol corresponde a un argumento; los primitivos se indexan en un `Map` (semántica SameValueZero: `NaN` funciona) y los objetos/funciones en un `WeakMap` (identidad + recolección automática). El nodo alcanzado tras el último argumento guarda el resultado. Es un decorador APARTE de `@Memoize` porque su semántica es distinta (dos literales `{a:1}` distintos son dos entradas); no reemplaza nada existente.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest.

---

### Task 1: @MemoizeByRef

**Files:**
- Create: `src/patterns/utility/memoize-by-ref.ts`
- Modify: `src/patterns/utility/memoize.ts` (una línea de JSDoc, ver Step 5)
- Modify: `src/index.ts`
- Test: `tests/memoize-by-ref.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/memoize-by-ref.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemoizeByRef } from '../src/patterns/utility/memoize-by-ref';

describe('@MemoizeByRef', () => {
  it('cachea por identidad: la misma referencia solo ejecuta una vez', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      process(config: { mode: string }): number {
        void config;
        return ++calls;
      }
    }

    const s = new Service();
    const config = { mode: 'fast' };
    expect(s.process(config)).toBe(1);
    expect(s.process(config)).toBe(1);
    expect(calls).toBe(1);
  });

  it('semántica por referencia: literales estructuralmente iguales son entradas distintas', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      process(config: { mode: string }): number {
        void config;
        return ++calls;
      }
    }

    const s = new Service();
    expect(s.process({ mode: 'fast' })).toBe(1);
    expect(s.process({ mode: 'fast' })).toBe(2);
    expect(calls).toBe(2);
  });

  it('admite argumentos circulares sin resolver de clave', () => {
    interface Node {
      name: string;
      self?: Node;
    }
    let calls = 0;

    class Walker {
      @MemoizeByRef
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

  it('distingue funciones por identidad (JSON.stringify las colapsaría)', () => {
    let calls = 0;

    class Runner {
      @MemoizeByRef
      run(fn: () => void): number {
        void fn;
        return ++calls;
      }
    }

    const r = new Runner();
    const a = () => {};
    const b = () => {};
    expect(r.run(a)).toBe(1);
    expect(r.run(b)).toBe(2);
    expect(r.run(a)).toBe(1);
    expect(calls).toBe(2);
  });

  it('combina primitivos y objetos en llamadas multi-argumento', () => {
    let calls = 0;

    class Calc {
      @MemoizeByRef
      compute(n: number, ctx: object): number {
        void n;
        void ctx;
        return ++calls;
      }
    }

    const c = new Calc();
    const ctx = {};
    expect(c.compute(1, ctx)).toBe(1);
    expect(c.compute(1, ctx)).toBe(1);
    expect(c.compute(2, ctx)).toBe(2);
    expect(c.compute(1, {})).toBe(3);
    expect(calls).toBe(3);
  });

  it('cada instancia tiene su propia cache (incluye métodos sin argumentos)', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      next(): number {
        return ++calls;
      }
    }

    const a = new Service();
    const b = new Service();
    expect(a.next()).toBe(1);
    expect(b.next()).toBe(2);
    expect(a.next()).toBe(1);
    expect(calls).toBe(2);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/memoize-by-ref.test.ts`
Expected: FAIL — no existe `src/patterns/utility/memoize-by-ref.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/memoize-by-ref.ts`:

```ts
interface CacheNode<Return> {
  hasResult: boolean;
  result: Return | undefined;
  primitives: Map<unknown, CacheNode<Return>> | undefined;
  objects: WeakMap<object, CacheNode<Return>> | undefined;
}

function createNode<Return>(): CacheNode<Return> {
  return { hasResult: false, result: undefined, primitives: undefined, objects: undefined };
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * Como @Memoize pero comparando los argumentos por IDENTIDAD (referencia),
 * sin serialización: cada nivel de un trie interno indexa un argumento —
 * los primitivos en un `Map` (SameValueZero: `NaN` funciona) y los
 * objetos/funciones en un `WeakMap`, de modo que las entradas se liberan
 * solas cuando el objeto argumento es recolectado.
 *
 * Semántica distinta a @Memoize: la MISMA referencia acierta la cache, pero
 * dos literales estructuralmente iguales (`{a:1}` y `{a:1}`) son entradas
 * DISTINTAS. Ideal para métodos que reciben entidades o funciones; inútil si
 * cada llamada construye el argumento de cero.
 *
 * Ventajas frente a la clave `JSON.stringify` de @Memoize: los argumentos
 * circulares no lanzan, las funciones y `Symbol` no colisionan y el orden de
 * propiedades es irrelevante.
 *
 * @example
 * ```ts
 * class Renderer {
 *   @MemoizeByRef
 *   layout(document: Document): Layout { ... } // misma entidad → cache
 * }
 * ```
 */
export function MemoizeByRef<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@MemoizeByRef solo puede aplicarse a un método');
  }
  const roots = new WeakMap<object, CacheNode<Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let node = roots.get(self);
    if (!node) {
      node = createNode<Return>();
      roots.set(self, node);
    }
    for (const arg of args) {
      if (isObjectLike(arg)) {
        node.objects ??= new WeakMap<object, CacheNode<Return>>();
        let child = node.objects.get(arg);
        if (!child) {
          child = createNode<Return>();
          node.objects.set(arg, child);
        }
        node = child;
      } else {
        node.primitives ??= new Map<unknown, CacheNode<Return>>();
        let child = node.primitives.get(arg);
        if (!child) {
          child = createNode<Return>();
          node.primitives.set(arg, child);
        }
        node = child;
      }
    }
    if (node.hasResult) {
      return node.result as Return;
    }
    const result = target.call(this, ...args);
    node.hasResult = true;
    node.result = result;
    return result;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/memoize-by-ref.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Referencia cruzada en el JSDoc de @Memoize**

En `src/patterns/utility/memoize.ts`, sustituye la línea:

```
 * Para esos casos, aporta tu propio resolver con la opción `key`.
```

por estas dos líneas:

```
 * Para esos casos, aporta tu propio resolver con la opción `key`, o usa
 * @MemoizeByRef si prefieres comparar los argumentos por referencia.
```

- [x] **Step 6: Exportar, suite completa, lint, build y commit**

En `src/index.ts`, añade justo después de la línea del export de `Memoize`:

```ts
export { MemoizeByRef } from './patterns/utility/memoize-by-ref';
```

Run: `npm test` — Expected: PASS (137 tests).
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run format` — aplica el formato.
Run: `npm run lint` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, con `memoize-by-ref.*` en `dist/patterns/utility/`.

- [ ] **Step 7: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @MemoizeByRef (memoizacion por identidad con trie de WeakMap)"
```

## Criterio de salida

- `npm test` (137 tests), `npm run typecheck`, `npm run lint`, `npm run format:check`
  y `npm run build` en verde.
- `@MemoizeByRef` exportado; `@Memoize` y su JSDoc actualizados solo con la
  referencia cruzada del Step 5.
- Todo commiteado.
