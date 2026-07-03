# Fase 6: @Sealed, @CachedFor, @Validate, @Mutex, @IterableOver, StateMachine — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices`, `test-driven-development` y `typescript-wizard`.
> Al terminar, invoca `verify`. Prerrequisito: Fase 5b completada (`npm test` con 86
> tests en verde). Cada task indica la carpeta de categoría donde va su archivo
> (`src/patterns/structural|utility|behavioral/`). Los tests van planos en `tests/`.
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`), sin añadir
> líneas nuevas.

**Goal:** Cierre del catálogo: `@Sealed` (instancias selladas), `@CachedFor` (memoize con caducidad), `@Validate` (precondiciones de argumentos), `@Mutex` (serializa llamadas async concurrentes), `@IterableOver` (patrón Iterator) y `StateMachine` + `@When` + `@TransitionTo` (patrón State).

**Architecture:** Igual que fases anteriores. Cada export nuevo se añade a `src/index.ts` bajo el comentario de su categoría. `StateMachine` sigue el modelo de `Subject` (Observer): las clases que usan sus decoradores la extienden.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest con fake timers y `expectTypeOf`.

---

### Task 1: @Sealed (structural)

**Files:**
- Create: `src/patterns/structural/sealed.ts`
- Modify: `src/index.ts`
- Test: `tests/sealed.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/sealed.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Sealed } from '../src/patterns/structural/sealed';

describe('@Sealed', () => {
  it('sella las instancias: no se pueden añadir propiedades', () => {
    @Sealed
    class Config {
      constructor(public host: string) {}
    }

    const c = new Config('localhost');
    expect(Object.isSealed(c)).toBe(true);
    expect(() => {
      (c as unknown as Record<string, unknown>).extra = 1;
    }).toThrow(TypeError);
  });

  it('las propiedades existentes siguen siendo modificables', () => {
    @Sealed
    class Config {
      constructor(public host: string) {}
    }

    const c = new Config('localhost');
    c.host = 'example.com';
    expect(c.host).toBe('example.com');
  });

  it('preserva instanceof', () => {
    @Sealed
    class Service {}

    expect(new Service()).toBeInstanceOf(Service);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/sealed.test.ts`
Expected: FAIL — no existe `src/patterns/structural/sealed.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/structural/sealed.ts`:

```ts
/**
 * Sella (`Object.seal`) cada instancia tras construirla: las propiedades
 * existentes pueden modificarse, pero no se pueden añadir ni eliminar.
 * Versión menos estricta de @Frozen.
 *
 * @example
 * ```ts
 * @Sealed
 * class Config {
 *   constructor(public host: string) {}
 * }
 * ```
 */
export function Sealed<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Sealed solo puede aplicarse a una clase');
  }
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const instance = Reflect.construct(original, args, newTarget) as object;
      return Object.seal(instance);
    },
  });
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/sealed.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Estructurales`:

```ts
export { Sealed } from './patterns/structural/sealed';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Sealed"
```

### Task 2: @CachedFor (utility)

**Files:**
- Create: `src/patterns/utility/cached-for.ts`
- Modify: `src/index.ts`
- Test: `tests/cached-for.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/cached-for.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CachedFor } from '../src/patterns/utility/cached-for';

describe('@CachedFor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cachea dentro del TTL y recalcula cuando caduca', () => {
    let calls = 0;

    class Api {
      @CachedFor(1000)
      fetchValue(id: number): string {
        calls++;
        return `v${id}:${calls}`;
      }
    }

    const api = new Api();
    expect(api.fetchValue(1)).toBe('v1:1');
    expect(api.fetchValue(1)).toBe('v1:1');
    expect(calls).toBe(1);

    vi.advanceTimersByTime(1000);
    expect(api.fetchValue(1)).toBe('v1:2');
    expect(calls).toBe(2);
  });

  it('distingue argumentos y mantiene una cache por instancia', () => {
    let calls = 0;

    class Api {
      @CachedFor(1000)
      get(id: number): number {
        void id;
        return ++calls;
      }
    }

    const a = new Api();
    const b = new Api();
    expect(a.get(1)).toBe(1);
    expect(a.get(2)).toBe(2);
    expect(a.get(1)).toBe(1);
    expect(b.get(1)).toBe(3);
  });

  it('rechaza TTL no positivos', () => {
    expect(() => CachedFor(0)).toThrow(RangeError);
    expect(() => CachedFor(-1)).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/cached-for.test.ts`
Expected: FAIL — no existe `src/patterns/utility/cached-for.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/cached-for.ts`:

```ts
/**
 * Como @Memoize pero con caducidad: cachea el resultado por combinación de
 * argumentos (clave `JSON.stringify(args)`) y por instancia durante `ttlMs`
 * milisegundos; después vuelve a ejecutar el método.
 *
 * @example
 * ```ts
 * class Api {
 *   @CachedFor(60_000) // cache de 1 minuto
 *   fetchConfig(env: string): Config { ... }
 * }
 * ```
 */
export function CachedFor(ttlMs: number) {
  if (ttlMs <= 0) {
    throw new RangeError('@CachedFor requiere un TTL mayor que 0 ms');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@CachedFor solo puede aplicarse a un método');
    }
    const caches = new WeakMap<object, Map<string, { value: Return; expiresAt: number }>>();
    return function (this: This, ...args: Args): Return {
      const self = this as object;
      let cache = caches.get(self);
      if (!cache) {
        cache = new Map<string, { value: Return; expiresAt: number }>();
        caches.set(self, cache);
      }
      const key = JSON.stringify(args);
      const entry = cache.get(key);
      const now = Date.now();
      if (entry && now < entry.expiresAt) {
        return entry.value;
      }
      const value = target.call(this, ...args);
      cache.set(key, { value, expiresAt: now + ttlMs });
      return value;
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/cached-for.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { CachedFor } from './patterns/utility/cached-for';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @CachedFor"
```

### Task 3: @Validate (utility)

**Files:**
- Create: `src/patterns/utility/validate.ts`
- Modify: `src/index.ts`
- Test: `tests/validate.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Validate } from '../src/patterns/utility/validate';

describe('@Validate', () => {
  it('deja pasar los argumentos válidos', () => {
    class Account {
      balance = 0;

      @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
      deposit(amount: number): void {
        this.balance += amount;
      }
    }

    const account = new Account();
    account.deposit(50);
    expect(account.balance).toBe(50);
  });

  it('lanza TypeError con el motivo y no ejecuta el método', () => {
    class Account {
      balance = 0;

      @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
      deposit(amount: number): void {
        this.balance += amount;
      }
    }

    const account = new Account();
    expect(() => account.deposit(-5)).toThrow(
      'Argumentos inválidos en deposit: el importe debe ser positivo'
    );
    expect(account.balance).toBe(0);
  });

  it('usa un mensaje genérico cuando el guard devuelve false', () => {
    class Calc {
      @Validate((n: number) => n >= 0)
      sqrt(n: number): number {
        return Math.sqrt(n);
      }
    }

    expect(() => new Calc().sqrt(-1)).toThrow(
      'Argumentos inválidos en sqrt: la validación falló'
    );
  });

  it('valida varios argumentos a la vez', () => {
    class Range {
      @Validate((min: number, max: number) => min <= max || 'min no puede ser mayor que max')
      set(min: number, max: number): [number, number] {
        return [min, max];
      }
    }

    expect(new Range().set(1, 5)).toEqual([1, 5]);
    expect(() => new Range().set(9, 2)).toThrow('min no puede ser mayor que max');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/validate.test.ts`
Expected: FAIL — no existe `src/patterns/utility/validate.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/validate.ts`:

```ts
/**
 * Guard de validación: devuelve `true` si los argumentos son válidos,
 * `false` (mensaje genérico) o un string con el motivo si no lo son.
 */
export type Guard<Args extends unknown[]> = (...args: Args) => boolean | string;

/**
 * Valida los argumentos antes de ejecutar el método: si el guard no
 * devuelve `true`, lanza `TypeError` con el motivo y el método NO se
 * ejecuta (precondiciones, diseño por contrato).
 *
 * @example
 * ```ts
 * class Account {
 *   @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
 *   deposit(amount: number): void { ... }
 * }
 * ```
 */
export function Validate<Args extends unknown[]>(guard: Guard<Args>) {
  return function <This, Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Validate solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      const verdict = guard(...args);
      if (verdict !== true) {
        const reason = typeof verdict === 'string' ? verdict : 'la validación falló';
        throw new TypeError(`Argumentos inválidos en ${methodName}: ${reason}`);
      }
      return target.call(this, ...args);
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/validate.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Validate, type Guard } from './patterns/utility/validate';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Validate"
```

### Task 4: @Mutex (utility)

**Files:**
- Create: `src/patterns/utility/mutex.ts`
- Modify: `src/index.ts`
- Test: `tests/mutex.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/mutex.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Mutex } from '../src/patterns/utility/mutex';

describe('@Mutex', () => {
  it('serializa las llamadas concurrentes en la misma instancia', async () => {
    const order: string[] = [];

    class Db {
      @Mutex
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

  it('un fallo no bloquea las llamadas siguientes', async () => {
    class Job {
      @Mutex
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

  it('instancias distintas no comparten el candado', async () => {
    const order: string[] = [];

    class Worker {
      constructor(private name: string) {}

      @Mutex
      async work(): Promise<void> {
        order.push(`start:${this.name}`);
        await Promise.resolve();
        order.push(`end:${this.name}`);
      }
    }

    await Promise.all([new Worker('a').work(), new Worker('b').work()]);
    expect(order).toEqual(['start:a', 'start:b', 'end:a', 'end:b']);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/mutex.test.ts`
Expected: FAIL — no existe `src/patterns/utility/mutex.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/mutex.ts`:

```ts
/**
 * Serializa las llamadas concurrentes a un método asíncrono en la misma
 * instancia: cada llamada espera a que termine la anterior (cola FIFO),
 * evitando condiciones de carrera. Un fallo no bloquea la cola.
 *
 * @example
 * ```ts
 * class Db {
 *   @Mutex
 *   async write(data: Data): Promise<void> { ... } // nunca en paralelo
 * }
 * ```
 */
export function Mutex<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
): (this: This, ...args: Args) => Promise<Return> {
  if (context.kind !== 'method') {
    throw new TypeError('@Mutex solo puede aplicarse a un método');
  }
  const locks = new WeakMap<object, Promise<unknown>>();
  return function (this: This, ...args: Args): Promise<Return> {
    const self = this as object;
    const previous = locks.get(self) ?? Promise.resolve();
    const run = previous.then(() => target.call(this, ...args));
    locks.set(
      self,
      run.catch(() => undefined)
    );
    return run;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/mutex.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Mutex } from './patterns/utility/mutex';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Mutex"
```

### Task 5: @IterableOver (patrón Iterator, behavioral)

**Files:**
- Create: `src/patterns/behavioral/iterable-over.ts`
- Modify: `src/index.ts`
- Test: `tests/iterable-over.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/iterable-over.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { IterableOver, type WithIterator } from '../src/patterns/behavioral/iterable-over';

describe('@IterableOver', () => {
  it('hace la clase iterable sobre la propiedad indicada', () => {
    @IterableOver('items')
    class Playlist {
      items = ['a', 'b', 'c'];
    }

    const p = new Playlist() as WithIterator<Playlist, string>;
    expect([...p]).toEqual(['a', 'b', 'c']);

    const seen: string[] = [];
    for (const song of p) {
      seen.push(song);
    }
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('itera el contenido actual de la propiedad', () => {
    @IterableOver('items')
    class Bag {
      items: number[] = [];
    }

    const bag = new Bag() as WithIterator<Bag, number>;
    bag.items.push(1, 2);
    expect([...bag]).toEqual([1, 2]);
    bag.items.push(3);
    expect([...bag]).toEqual([1, 2, 3]);
  });

  it('lanza con mensaje claro si la propiedad no es iterable', () => {
    @IterableOver('value')
    class Box {
      value = 42;
    }

    const box = new Box() as WithIterator<Box, never>;
    expect(() => [...box]).toThrow('La propiedad "value" no es iterable');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/iterable-over.test.ts`
Expected: FAIL — no existe `src/patterns/behavioral/iterable-over.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/behavioral/iterable-over.ts`:

```ts
/** Tipo de una instancia iterable: la original más el protocolo Iterable. */
export type WithIterator<T, Item> = T & Iterable<Item>;

/**
 * Patrón Iterator: hace la clase iterable (`for...of`, spread,
 * `Array.from`) delegando en la propiedad iterable indicada (normalmente
 * un array interno).
 *
 * `Symbol.iterator` existe en runtime; para que el sistema de tipos lo
 * vea, castea con `WithIterator<Clase, Elemento>` (los decoradores TC39 no
 * pueden ampliar el tipo de la clase, igual que ocurre con @Adapt).
 *
 * @example
 * ```ts
 * @IterableOver('items')
 * class Playlist {
 *   items: Song[] = [];
 * }
 * for (const song of playlist as WithIterator<Playlist, Song>) { ... }
 * ```
 */
export function IterableOver(property: string) {
  return function <T extends new (...args: any[]) => object>(
    target: T,
    context: ClassDecoratorContext<T>
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@IterableOver solo puede aplicarse a una clase');
    }
    Object.defineProperty(target.prototype, Symbol.iterator, {
      value: function (this: Record<string, unknown>): Iterator<unknown> {
        const source = this[property] as
          | { [Symbol.iterator]?: () => Iterator<unknown> }
          | null
          | undefined;
        const iteratorFn = source?.[Symbol.iterator];
        if (typeof iteratorFn !== 'function') {
          throw new TypeError(
            `La propiedad "${property}" no es iterable; @IterableOver necesita un array u otro iterable`
          );
        }
        return iteratorFn.call(source);
      },
      writable: true,
      configurable: true,
    });
    return target;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/iterable-over.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// De comportamiento`:

```ts
export { IterableOver, type WithIterator } from './patterns/behavioral/iterable-over';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @IterableOver (patrón Iterator)"
```

### Task 6: StateMachine + @When + @TransitionTo (patrón State, behavioral)

**Files:**
- Create: `src/patterns/behavioral/state-machine.ts`
- Modify: `src/index.ts`
- Test: `tests/state-machine.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/state-machine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { StateMachine, TransitionTo, When } from '../src/patterns/behavioral/state-machine';

type DocState = 'draft' | 'review' | 'published';

class Doc extends StateMachine<DocState> {
  constructor() {
    super('draft');
  }

  @When('draft')
  @TransitionTo('review')
  submit(): string {
    return 'enviado';
  }

  @When('review')
  @TransitionTo('published')
  approve(): void {}

  @When('review')
  @TransitionTo('draft')
  reject(): void {}
}

describe('StateMachine + @When + @TransitionTo', () => {
  it('transiciona al estado indicado tras ejecutar el método', () => {
    const doc = new Doc();
    expect(doc.state).toBe('draft');
    expect(doc.submit()).toBe('enviado');
    expect(doc.state).toBe('review');
    doc.approve();
    expect(doc.state).toBe('published');
  });

  it('lanza si el método se llama en un estado no permitido', () => {
    const doc = new Doc();
    doc.submit();
    expect(() => doc.submit()).toThrow(
      'El método submit no puede llamarse en el estado "review" (permitidos: draft)'
    );
  });

  it('reject devuelve el documento a draft', () => {
    const doc = new Doc();
    doc.submit();
    doc.reject();
    expect(doc.state).toBe('draft');
    doc.submit();
    expect(doc.state).toBe('review');
  });

  it('@When acepta varios estados permitidos', () => {
    class Player extends StateMachine<'stopped' | 'playing' | 'paused'> {
      constructor() {
        super('stopped');
      }

      @When('stopped', 'paused')
      @TransitionTo('playing')
      play(): void {}
    }

    const p = new Player();
    p.play();
    expect(p.state).toBe('playing');
    expect(() => p.play()).toThrow('no puede llamarse en el estado "playing"');
  });

  it('no transiciona si el método lanza', () => {
    class Job extends StateMachine<'idle' | 'done'> {
      constructor() {
        super('idle');
      }

      @When('idle')
      @TransitionTo('done')
      run(): void {
        throw new Error('boom');
      }
    }

    const j = new Job();
    expect(() => j.run()).toThrow('boom');
    expect(j.state).toBe('idle');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/state-machine.test.ts`
Expected: FAIL — no existe `src/patterns/behavioral/state-machine.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/behavioral/state-machine.ts`:

```ts
/**
 * Máquina de estados mínima (patrón State). Las clases que quieran usar
 * `@When` y `@TransitionTo` deben extenderla (mismo modelo que `Subject`
 * en el patrón Observer).
 */
export class StateMachine<State extends string = string> {
  #state: State;

  constructor(initialState: State) {
    this.#state = initialState;
  }

  /** Estado actual. */
  get state(): State {
    return this.#state;
  }

  /** Cambia el estado. Normalmente lo hace @TransitionTo. */
  transitionTo(next: State): void {
    this.#state = next;
  }
}

/**
 * Guarda de estado: el método solo puede llamarse cuando la máquina está
 * en alguno de los estados permitidos; en otro caso lanza `Error` y el
 * método no se ejecuta. Colócalo como decorador MÁS EXTERNO (encima de
 * @TransitionTo) para que la guarda se evalúe primero.
 *
 * @example
 * ```ts
 * class Doc extends StateMachine<'draft' | 'review'> {
 *   @When('draft')
 *   @TransitionTo('review')
 *   submit(): void { ... }
 * }
 * ```
 */
export function When(...allowed: string[]) {
  return function <This extends StateMachine<string>, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@When solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!allowed.includes(this.state)) {
        throw new Error(
          `El método ${methodName} no puede llamarse en el estado "${this.state}" (permitidos: ${allowed.join(', ')})`
        );
      }
      return target.call(this, ...args);
    };
  };
}

/**
 * Tras ejecutar el método con éxito, transiciona la máquina al estado
 * indicado. Si el método lanza, el estado no cambia.
 *
 * @example ver @When
 */
export function TransitionTo(next: string) {
  return function <This extends StateMachine<string>, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@TransitionTo solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const result = target.call(this, ...args);
      this.transitionTo(next);
      return result;
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/state-machine.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final del bloque `// De comportamiento`:

```ts
export { StateMachine, TransitionTo, When } from './patterns/behavioral/state-machine';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, con los 6 archivos nuevos en `dist/patterns/`.

- [ ] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: patrón State (StateMachine, @When y @TransitionTo)"
```

## Criterio de salida de la Fase 6 (cierre del catálogo)

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- Nuevos exports en `src/index.ts`: `Sealed`, `CachedFor`, `Validate`/`Guard`,
  `Mutex`, `IterableOver`/`WithIterator`, `StateMachine`/`When`/`TransitionTo`.
- Todo commiteado. El catálogo de patrones queda cerrado (v1.2).
