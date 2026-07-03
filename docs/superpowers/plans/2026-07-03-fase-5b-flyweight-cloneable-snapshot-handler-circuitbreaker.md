# Fase 5b: @Flyweight, @Cloneable, @Snapshot, @HandlerFor, @CircuitBreaker — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices`, `test-driven-development` y `typescript-wizard`.
> Al terminar, invoca `verify`. Prerrequisito: Fase 5a completada (`npm test` en verde).
> Los patrones van en la carpeta de su categoría (indicada en cada task). Los tests
> siguen planos en `tests/`. Marca los checkboxes editando la línea existente
> (`- [x]` → `- [x]`), sin añadir líneas nuevas.

**Goal:** Cuatro patrones GoF que faltaban — `@Flyweight` (instancias compartidas por argumentos), `@Cloneable` (Prototype), `SnapshotHistory` + `@Snapshot` (Memento) y `HandlerChain` + `@HandlerFor` (Chain of Responsibility) — más `@CircuitBreaker` (corta llamadas a métodos async que fallan repetidamente).

**Architecture:** Igual que fases anteriores. Cada export nuevo se añade a `src/index.ts` bajo el comentario de su categoría (`// Creacionales`, `// Estructurales`, `// De comportamiento`, `// Utilitarios de método`).

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest con fake timers y `expectTypeOf`.

---

### Task 1: @Flyweight (GoF estructural)

**Files:**
- Create: `src/patterns/structural/flyweight.ts`
- Modify: `src/index.ts`
- Test: `tests/flyweight.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/flyweight.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Flyweight } from '../src/patterns/structural/flyweight';

describe('@Flyweight', () => {
  it('reutiliza la instancia cuando los argumentos coinciden', () => {
    let constructions = 0;

    @Flyweight
    class Color {
      constructor(public name: string) {
        constructions++;
      }
    }

    const a = new Color('red');
    const b = new Color('red');
    const c = new Color('blue');

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(constructions).toBe(2);
  });

  it('distingue combinaciones de varios argumentos', () => {
    @Flyweight
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }

    expect(new Point(1, 2)).toBe(new Point(1, 2));
    expect(new Point(1, 2)).not.toBe(new Point(2, 1));
  });

  it('preserva instanceof', () => {
    @Flyweight
    class Glyph {
      constructor(public char: string) {}
    }

    expect(new Glyph('a')).toBeInstanceOf(Glyph);
  });

  it('cada clase decorada tiene su propia cache', () => {
    @Flyweight
    class A {
      constructor(public v: number) {}
    }
    @Flyweight
    class B {
      constructor(public v: number) {}
    }

    expect(new A(1)).not.toBe(new B(1));
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/flyweight.test.ts`
Expected: FAIL — no existe `src/patterns/structural/flyweight.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/structural/flyweight.ts`:

```ts
/**
 * Patrón Flyweight: comparte instancias por combinación de argumentos del
 * constructor (clave `JSON.stringify(args)`). `new Color('red')` devuelve
 * siempre el mismo objeto para los mismos argumentos. Pensado para objetos
 * de valor inmutables que se repiten mucho.
 *
 * @example
 * ```ts
 * @Flyweight
 * class Color {
 *   constructor(public name: string) {}
 * }
 * new Color('red') === new Color('red'); // true
 * ```
 */
export function Flyweight<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Flyweight solo puede aplicarse a una clase');
  }
  const instances = new Map<string, InstanceType<T>>();
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const key = JSON.stringify(args);
      let instance = instances.get(key);
      if (!instance) {
        instance = Reflect.construct(original, args, newTarget) as InstanceType<T>;
        instances.set(key, instance);
      }
      return instance;
    },
  });
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/flyweight.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Estructurales`:

```ts
export { Flyweight } from './patterns/structural/flyweight';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Flyweight (patrón Flyweight)"
```

### Task 2: @Cloneable (patrón Prototype, creacional)

**Files:**
- Create: `src/patterns/creational/cloneable.ts`
- Modify: `src/index.ts`
- Test: `tests/cloneable.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/cloneable.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Cloneable, type WithClone } from '../src/patterns/creational/cloneable';

describe('@Cloneable', () => {
  it('clone() crea una copia independiente con el mismo estado', () => {
    @Cloneable
    class Document {
      constructor(
        public title: string,
        public tags: string[]
      ) {}
    }

    const original = new Document('spec', ['draft']) as WithClone<Document>;
    const copy = original.clone();

    expect(copy).not.toBe(original);
    expect(copy.title).toBe('spec');
    copy.title = 'copia';
    expect(original.title).toBe('spec');
  });

  it('la copia preserva instanceof', () => {
    @Cloneable
    class Shape {
      kind = 'circle';
    }

    const copy = (new Shape() as WithClone<Shape>).clone();
    expect(copy).toBeInstanceOf(Shape);
  });

  it('la copia es superficial (los objetos anidados se comparten)', () => {
    @Cloneable
    class Box {
      constructor(public items: string[]) {}
    }

    const original = new Box(['a']) as WithClone<Box>;
    const copy = original.clone();
    expect(copy.items).toBe(original.items);
  });

  it('el tipo WithClone expone clone() tipado', () => {
    @Cloneable
    class Point {
      x = 0;
    }

    const p = new Point() as WithClone<Point>;
    expectTypeOf(p.clone).returns.toEqualTypeOf<WithClone<Point>>();
    expectTypeOf(p.clone().x).toEqualTypeOf<number>();
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/cloneable.test.ts`
Expected: FAIL — no existe `src/patterns/creational/cloneable.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/creational/cloneable.ts`:

```ts
/** Tipo de una instancia clonable: la original más el método clone(). */
export type WithClone<T> = T & { clone(): WithClone<T> };

/**
 * Patrón Prototype: añade un método `clone()` que crea una copia
 * SUPERFICIAL de la instancia (mismo prototipo, mismas propiedades propias;
 * los objetos anidados se comparten).
 *
 * `clone()` existe en runtime; para que el sistema de tipos lo vea, castea
 * con `WithClone<Clase>` (los decoradores TC39 no pueden ampliar el tipo
 * de la clase, igual que ocurre con @Adapt).
 *
 * @example
 * ```ts
 * @Cloneable
 * class Document { ... }
 * const copy = (doc as WithClone<Document>).clone();
 * ```
 */
export function Cloneable<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Cloneable solo puede aplicarse a una clase');
  }
  Object.defineProperty(target.prototype, 'clone', {
    value: function (this: object): object {
      const copy = Object.create(Object.getPrototypeOf(this) as object) as object;
      return Object.assign(copy, this);
    },
    writable: true,
    configurable: true,
  });
  return target;
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/cloneable.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Creacionales`:

```ts
export { Cloneable, type WithClone } from './patterns/creational/cloneable';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Cloneable (patrón Prototype)"
```

### Task 3: @Snapshot (patrón Memento, comportamiento)

**Files:**
- Create: `src/patterns/behavioral/snapshot.ts`
- Modify: `src/index.ts`
- Test: `tests/snapshot.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/snapshot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Snapshot, SnapshotHistory } from '../src/patterns/behavioral/snapshot';

describe('SnapshotHistory + @Snapshot', () => {
  it('guarda el estado antes de cada mutación y lo restaura en orden LIFO', () => {
    const history = new SnapshotHistory();

    class Editor {
      content = '';

      @Snapshot(history)
      write(text: string): void {
        this.content += text;
      }
    }

    const editor = new Editor();
    editor.write('hola');
    editor.write(' mundo');
    expect(editor.content).toBe('hola mundo');
    expect(history.size).toBe(2);

    history.restoreLast();
    expect(editor.content).toBe('hola');
    history.restoreLast();
    expect(editor.content).toBe('');
    expect(history.size).toBe(0);
  });

  it('restaura la instancia correcta cuando hay varias', () => {
    const history = new SnapshotHistory();

    class Counter {
      value = 0;

      @Snapshot(history)
      set(value: number): void {
        this.value = value;
      }
    }

    const a = new Counter();
    const b = new Counter();
    a.set(1);
    b.set(9);

    history.restoreLast(); // deshace b.set(9)
    expect(b.value).toBe(0);
    expect(a.value).toBe(1);
  });

  it('lanza al restaurar con el historial vacío', () => {
    const history = new SnapshotHistory();
    expect(() => history.restoreLast()).toThrow('No hay snapshots que restaurar');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/snapshot.test.ts`
Expected: FAIL — no existe `src/patterns/behavioral/snapshot.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/behavioral/snapshot.ts`:

```ts
/**
 * Historial de estados (patrón Memento). Guarda copias superficiales de las
 * propiedades propias y enumerables de la instancia y permite restaurarlas
 * en orden LIFO.
 */
export class SnapshotHistory {
  #mementos: Array<{ instance: object; state: Record<string, unknown> }> = [];

  /** Guarda una copia superficial del estado actual. Normalmente lo llama @Snapshot. */
  save(instance: object): void {
    this.#mementos.push({ instance, state: { ...(instance as Record<string, unknown>) } });
  }

  /** Restaura el último estado guardado sobre su instancia. Lanza si está vacío. */
  restoreLast(): void {
    const memento = this.#mementos.pop();
    if (!memento) {
      throw new Error('No hay snapshots que restaurar');
    }
    Object.assign(memento.instance, memento.state);
  }

  get size(): number {
    return this.#mementos.length;
  }
}

/**
 * Antes de ejecutar el método, guarda en el historial una copia superficial
 * del estado de la instancia (patrón Memento). `history.restoreLast()`
 * revierte la última mutación. Limitación: la restauración reasigna las
 * propiedades guardadas pero no elimina propiedades añadidas después.
 *
 * @example
 * ```ts
 * const history = new SnapshotHistory();
 * class Editor {
 *   @Snapshot(history)
 *   write(text: string): void { this.content += text; }
 * }
 * history.restoreLast(); // deshace el último write
 * ```
 */
export function Snapshot(history: SnapshotHistory) {
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Snapshot solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      history.save(this);
      return target.call(this, ...args);
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/snapshot.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// De comportamiento`:

```ts
export { Snapshot, SnapshotHistory } from './patterns/behavioral/snapshot';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Memento (SnapshotHistory y @Snapshot)"
```

### Task 4: @HandlerFor (patrón Chain of Responsibility, comportamiento)

**Files:**
- Create: `src/patterns/behavioral/handler-chain.ts`
- Modify: `src/index.ts`
- Test: `tests/handler-chain.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/handler-chain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HandlerChain, HandlerFor, type Handler } from '../src/patterns/behavioral/handler-chain';

describe('HandlerChain + @HandlerFor', () => {
  it('la petición la procesa el primer handler que puede, por prioridad', () => {
    const chain = new HandlerChain<number, string>();

    @HandlerFor(chain, 2)
    class AnyNumber implements Handler<number, string> {
      canHandle(): boolean {
        return true;
      }
      handle(n: number): string {
        return `generic:${n}`;
      }
    }
    void AnyNumber;

    @HandlerFor(chain, 1)
    class Negative implements Handler<number, string> {
      canHandle(n: number): boolean {
        return n < 0;
      }
      handle(n: number): string {
        return `negative:${n}`;
      }
    }
    void Negative;

    expect(chain.dispatch(-5)).toBe('negative:-5');
    expect(chain.dispatch(7)).toBe('generic:7');
  });

  it('lanza si ningún handler acepta la petición', () => {
    const chain = new HandlerChain<string, string>();

    @HandlerFor(chain)
    class OnlyHello implements Handler<string, string> {
      canHandle(request: string): boolean {
        return request === 'hola';
      }
      handle(): string {
        return 'ok';
      }
    }
    void OnlyHello;

    expect(() => chain.dispatch('adiós')).toThrow(
      'Ningún handler de la cadena pudo procesar la petición'
    );
  });

  it('register() también funciona sin decorador', () => {
    const chain = new HandlerChain<string, number>();
    chain.register({ canHandle: () => true, handle: (s) => s.length });
    expect(chain.dispatch('abc')).toBe(3);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/handler-chain.test.ts`
Expected: FAIL — no existe `src/patterns/behavioral/handler-chain.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/behavioral/handler-chain.ts`:

```ts
/** Eslabón de la cadena: decide si puede procesar la petición y la procesa. */
export interface Handler<Request, Result> {
  canHandle(request: Request): boolean;
  handle(request: Request): Result;
}

/**
 * Cadena de responsabilidad: recorre los handlers en orden de prioridad
 * (menor número = antes) y delega en el primero cuyo `canHandle` acepte.
 */
export class HandlerChain<Request, Result> {
  #entries: Array<{ priority: number; handler: Handler<Request, Result> }> = [];

  register(handler: Handler<Request, Result>, priority = 0): void {
    this.#entries.push({ priority, handler });
    this.#entries.sort((a, b) => a.priority - b.priority);
  }

  dispatch(request: Request): Result {
    for (const { handler } of this.#entries) {
      if (handler.canHandle(request)) {
        return handler.handle(request);
      }
    }
    throw new Error('Ningún handler de la cadena pudo procesar la petición');
  }
}

/**
 * Registra una instancia de la clase decorada (constructor sin argumentos)
 * como eslabón de la cadena, con la prioridad indicada (menor = antes).
 *
 * @example
 * ```ts
 * const chain = new HandlerChain<Request, Response>();
 *
 * @HandlerFor(chain, 1)
 * class AuthHandler implements Handler<Request, Response> { ... }
 *
 * chain.dispatch(request);
 * ```
 */
export function HandlerFor<Request, Result>(chain: HandlerChain<Request, Result>, priority = 0) {
  return function <T extends new () => Handler<Request, Result>>(
    target: T,
    context: ClassDecoratorContext<T>
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@HandlerFor solo puede aplicarse a una clase');
    }
    chain.register(new target(), priority);
    return target;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/handler-chain.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// De comportamiento`:

```ts
export { HandlerChain, HandlerFor, type Handler } from './patterns/behavioral/handler-chain';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Chain of Responsibility (HandlerChain y @HandlerFor)"
```

### Task 5: @CircuitBreaker (utility)

**Files:**
- Create: `src/patterns/utility/circuit-breaker.ts`
- Modify: `src/index.ts`
- Test: `tests/circuit-breaker.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/circuit-breaker.test.ts`:

```ts
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
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/circuit-breaker.test.ts`
Expected: FAIL — no existe `src/patterns/utility/circuit-breaker.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/circuit-breaker.ts`:

```ts
export interface CircuitBreakerOptions {
  /** Fallos consecutivos que abren el circuito. Mínimo 1. */
  failures: number;
  /** Milisegundos que el circuito permanece abierto antes de permitir otro intento. */
  resetMs: number;
}

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | undefined;
}

/**
 * Circuit breaker para métodos asíncronos: tras `failures` fallos
 * consecutivos, el circuito se abre y las llamadas fallan inmediatamente
 * (sin ejecutar el método) durante `resetMs` ms. Pasado ese tiempo, se
 * permite un intento (semiabierto): si tiene éxito el circuito se cierra;
 * si falla, vuelve a abrirse. El estado es por instancia.
 *
 * @example
 * ```ts
 * class Api {
 *   @CircuitBreaker({ failures: 3, resetMs: 30_000 })
 *   async fetchData(): Promise<Data> { ... }
 * }
 * ```
 */
export function CircuitBreaker({ failures, resetMs }: CircuitBreakerOptions) {
  if (failures < 1) {
    throw new RangeError('@CircuitBreaker requiere al menos 1 fallo para abrir el circuito');
  }
  if (resetMs <= 0) {
    throw new RangeError('@CircuitBreaker requiere un resetMs mayor que 0');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@CircuitBreaker solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    const states = new WeakMap<object, BreakerState>();
    return async function (this: This, ...args: Args): Promise<Return> {
      const self = this as object;
      let state = states.get(self);
      if (!state) {
        state = { consecutiveFailures: 0, openedAt: undefined };
        states.set(self, state);
      }
      if (state.openedAt !== undefined) {
        if (Date.now() - state.openedAt < resetMs) {
          throw new Error(
            `Circuito abierto para ${methodName}: demasiados fallos consecutivos`
          );
        }
        state.openedAt = undefined; // semiabierto: se permite un intento
      }
      try {
        const result = await target.call(this, ...args);
        state.consecutiveFailures = 0;
        return result;
      } catch (error) {
        state.consecutiveFailures++;
        if (state.consecutiveFailures >= failures) {
          state.openedAt = Date.now();
        }
        throw error;
      }
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/circuit-breaker.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { CircuitBreaker, type CircuitBreakerOptions } from './patterns/utility/circuit-breaker';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, con los 5 archivos nuevos en `dist/patterns/`.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @CircuitBreaker"
```

## Criterio de salida de la Fase 5b (y de la v1.1)

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- Nuevos exports en `src/index.ts`: `Flyweight`, `Cloneable`/`WithClone`,
  `Snapshot`/`SnapshotHistory`, `HandlerChain`/`HandlerFor`/`Handler`,
  `CircuitBreaker`/`CircuitBreakerOptions`.
- Todo commiteado. Catálogo v1.1 completo (25 símbolos públicos).
