# Fase 3: Observer (@Emits), Factory (@RegisterIn), Builder — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`; para la Task 3 (builder),
> invoca además `typescript-wizard`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 1 completada (`npm test` en verde). No depende de la Fase 2, pero
> el orden oficial es 2 → 3.

**Goal:** Tres patrones con infraestructura propia: Observer (clase `Subject` + decorador `@Emits`), Factory (clase `Factory` + decorador `@RegisterIn`) y Builder (helper `builderFor` con tipos fluidos generados).

**Architecture:** Cada patrón exporta su decorador MÁS la pieza de runtime que necesita (event-emitter, registro). El Builder es un helper de función, no un decorador: los decoradores TC39 no pueden añadir métodos estáticos al *tipo* de una clase, así que un `@Buildable` mentiría al sistema de tipos (esto está documentado en el JSDoc).

**Tech Stack:** TypeScript 5 (decoradores TC39, template literal types, mapped types), vitest con `expectTypeOf`.

---

### Task 1: Observer — Subject y @Emits

**Files:**
- Create: `src/patterns/observer.ts`
- Modify: `src/index.ts`
- Test: `tests/observer.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/observer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Emits, Subject } from '../src/patterns/observer';

describe('Subject', () => {
  it('notifica a los suscriptores del evento', () => {
    const subject = new Subject();
    const received: unknown[] = [];
    subject.on('saved', (payload) => received.push(payload));

    subject.emit('saved', { id: 1 });

    expect(received).toEqual([{ id: 1 }]);
  });

  it('no notifica eventos distintos ni suscriptores dados de baja', () => {
    const subject = new Subject();
    const received: unknown[] = [];
    const unsubscribe = subject.on('saved', (payload) => received.push(payload));
    subject.on('deleted', () => received.push('no debería llegar por saved'));

    subject.emit('saved', 'primero');
    unsubscribe();
    subject.emit('saved', 'segundo');

    expect(received).toEqual(['primero']);
  });
});

describe('@Emits', () => {
  it('emite el evento con el valor de retorno tras ejecutar el método', () => {
    class UserService extends Subject {
      @Emits('user:created')
      create(name: string): { name: string } {
        return { name };
      }
    }

    const service = new UserService();
    const received: unknown[] = [];
    service.on('user:created', (payload) => received.push(payload));

    const result = service.create('Ana');

    expect(result).toEqual({ name: 'Ana' });
    expect(received).toEqual([{ name: 'Ana' }]);
  });

  it('no emite si el método lanza', () => {
    class Failing extends Subject {
      @Emits('done')
      run(): void {
        throw new Error('boom');
      }
    }

    const f = new Failing();
    let notified = false;
    f.on('done', () => {
      notified = true;
    });

    expect(() => f.run()).toThrow('boom');
    expect(notified).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/observer.test.ts`
Expected: FAIL — no existe `src/patterns/observer.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/observer.ts`:

```ts
export type Listener = (payload: unknown) => void;

/**
 * Sujeto observable mínimo (patrón Observer). Las clases que quieran usar
 * `@Emits` deben extender `Subject`.
 */
export class Subject {
  #listeners = new Map<string, Set<Listener>>();

  /** Suscribe un listener al evento. Devuelve la función para desuscribirse. */
  on(event: string, listener: Listener): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set<Listener>();
      this.#listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Notifica a todos los listeners del evento. */
  emit(event: string, payload: unknown): void {
    this.#listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

/**
 * Tras ejecutar el método con éxito, emite `event` en el propio objeto
 * (que debe extender `Subject`) con el valor de retorno como payload.
 * Si el método lanza, no se emite nada.
 *
 * @example
 * ```ts
 * class UserService extends Subject {
 *   @Emits('user:created')
 *   create(name: string): User { ... }
 * }
 * ```
 */
export function Emits(event: string) {
  return function <This extends Subject, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Emits solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const result = target.call(this, ...args);
      this.emit(event, result);
      return result;
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/observer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Emits, Subject, type Listener } from './patterns/observer';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Observer (Subject y @Emits)"
```

### Task 2: Factory — Factory y @RegisterIn

**Files:**
- Create: `src/patterns/factory.ts`
- Modify: `src/index.ts`
- Test: `tests/factory.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/factory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Factory, RegisterIn } from '../src/patterns/factory';

interface Shape {
  area(): number;
}

describe('Factory + @RegisterIn', () => {
  it('crea instancias por clave registrada con el decorador', () => {
    const shapes = new Factory<Shape>();

    @RegisterIn(shapes, 'circle')
    class Circle implements Shape {
      constructor(private radius: number) {}
      area(): number {
        return Math.PI * this.radius ** 2;
      }
    }

    @RegisterIn(shapes, 'square')
    class Square implements Shape {
      constructor(private side: number) {}
      area(): number {
        return this.side ** 2;
      }
    }

    const circle = shapes.create('circle', 1);
    const square = shapes.create('square', 3);

    expect(circle).toBeInstanceOf(Circle);
    expect(square.area()).toBe(9);
    expect(shapes.keys().sort()).toEqual(['circle', 'square']);
  });

  it('lanza con mensaje claro si la clave no existe', () => {
    const shapes = new Factory<Shape>();

    @RegisterIn(shapes, 'circle')
    class Circle implements Shape {
      area(): number {
        return 0;
      }
    }
    void Circle;

    expect(() => shapes.create('triangle')).toThrow('Clave "triangle" no registrada');
  });

  it('lanza si se registra dos veces la misma clave', () => {
    const shapes = new Factory<Shape>();
    shapes.register('circle', class implements Shape {
      area(): number {
        return 0;
      }
    });

    expect(() =>
      shapes.register('circle', class implements Shape {
        area(): number {
          return 1;
        }
      })
    ).toThrow('ya está registrada');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/factory.test.ts`
Expected: FAIL — no existe `src/patterns/factory.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/factory.ts`:

```ts
type Ctor<Base> = new (...args: any[]) => Base;

/**
 * Registro de constructores por clave (patrón Factory). Las clases se
 * registran manualmente con `register` o con el decorador `@RegisterIn`.
 */
export class Factory<Base extends object = object> {
  #ctors = new Map<string, Ctor<Base>>();

  register(key: string, ctor: Ctor<Base>): void {
    if (this.#ctors.has(key)) {
      throw new Error(`La clave "${key}" ya está registrada en la factoría`);
    }
    this.#ctors.set(key, ctor);
  }

  create(key: string, ...args: any[]): Base {
    const ctor = this.#ctors.get(key);
    if (!ctor) {
      throw new Error(
        `Clave "${key}" no registrada en la factoría. Disponibles: ${this.keys().join(', ') || '(ninguna)'}`
      );
    }
    return new ctor(...args);
  }

  keys(): string[] {
    return [...this.#ctors.keys()];
  }
}

/**
 * Registra la clase decorada en una factoría bajo la clave indicada.
 *
 * @example
 * ```ts
 * const shapes = new Factory<Shape>();
 *
 * @RegisterIn(shapes, 'circle')
 * class Circle implements Shape { ... }
 *
 * shapes.create('circle', 5);
 * ```
 */
export function RegisterIn<Base extends object>(factory: Factory<Base>, key: string) {
  return function <T extends Ctor<Base>>(target: T, context: ClassDecoratorContext<T>): T {
    if (context.kind !== 'class') {
      throw new TypeError('@RegisterIn solo puede aplicarse a una clase');
    }
    factory.register(key, target);
    return target;
  };
}
```

Nota sobre `any[]`: es la excepción permitida por el proyecto para firmas de
constructores (`unknown[]` rompería la asignabilidad de constructores concretos).

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/factory.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Factory, RegisterIn } from './patterns/factory';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Factory (Factory y @RegisterIn)"
```

### Task 3: Builder — builderFor

Invoca la skill `typescript-wizard` antes de esta task: usa mapped types con
template literal keys.

**Files:**
- Create: `src/patterns/builder.ts`
- Modify: `src/index.ts`
- Test: `tests/builder.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/builder.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { builderFor, type Builder } from '../src/patterns/builder';

class User {
  name = '';
  age = 0;
  email = '';
}

describe('builderFor', () => {
  it('construye el objeto con los valores encadenados', () => {
    const user = builderFor(User).withName('Ana').withAge(30).withEmail('ana@example.com').build();

    expect(user).toBeInstanceOf(User);
    expect(user).toMatchObject({ name: 'Ana', age: 30, email: 'ana@example.com' });
  });

  it('las propiedades no establecidas conservan su valor por defecto', () => {
    const user = builderFor(User).withName('Bob').build();

    expect(user.name).toBe('Bob');
    expect(user.age).toBe(0);
  });

  it('cada builder es independiente', () => {
    const a = builderFor(User).withName('A').build();
    const b = builderFor(User).withName('B').build();

    expect(a.name).toBe('A');
    expect(b.name).toBe('B');
  });

  it('lanza ante métodos que no existen', () => {
    const builder = builderFor(User) as unknown as Record<string, () => unknown>;
    expect(() => builder['withSalary']!()).not.toThrow();
    expect(() => builder['delete']!()).toThrow(TypeError);
  });

  it('los tipos del builder son fluidos y estrictos', () => {
    const builder = builderFor(User);
    expectTypeOf(builder.withName).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(builder.withAge).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(builder.build()).toEqualTypeOf<User>();
    expectTypeOf(builder.withName('x')).toEqualTypeOf<Builder<User>>();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/builder.test.ts`
Expected: FAIL — no existe `src/patterns/builder.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/builder.ts`:

```ts
type BuilderMethods<T> = {
  [K in keyof T & string as `with${Capitalize<K>}`]-?: (value: T[K]) => Builder<T>;
};

/** Tipo fluido: un método `with<Propiedad>` por cada propiedad de T, más `build()`. */
export type Builder<T> = BuilderMethods<T> & { build(): T };

/**
 * Crea un builder fluido para una clase con constructor sin argumentos
 * (patrón Builder). Cada propiedad `foo` de la clase genera un método
 * `withFoo(valor)`; `build()` instancia la clase y aplica los valores.
 *
 * Es un helper y no un decorador `@Buildable` a propósito: los decoradores
 * TC39 no pueden añadir métodos estáticos al tipo de la clase, así que un
 * decorador aquí no podría tiparse honestamente.
 *
 * @example
 * ```ts
 * const user = builderFor(User).withName('Ana').withAge(30).build();
 * ```
 */
export function builderFor<T extends object>(ctor: new () => T): Builder<T> {
  const values = new Map<string, unknown>();
  const proxy: object = new Proxy(Object.create(null) as object, {
    get(_ignored, prop) {
      if (typeof prop !== 'string') {
        throw new TypeError('Los métodos del builder deben ser strings');
      }
      if (prop === 'build') {
        return (): T => {
          const instance = new ctor();
          for (const [key, value] of values) {
            (instance as Record<string, unknown>)[key] = value;
          }
          return instance;
        };
      }
      if (prop.startsWith('with') && prop.length > 4) {
        const head = prop[4] as string;
        const key = head.toLowerCase() + prop.slice(5);
        return (value: unknown): object => {
          values.set(key, value);
          return proxy;
        };
      }
      throw new TypeError(
        `Método desconocido en el builder: "${prop}". Usa with<Propiedad>(valor) o build()`
      );
    },
  });
  return proxy as Builder<T>;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/builder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final:

```ts
export { builderFor, type Builder } from './patterns/builder';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores.

- [ ] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: patrón Builder (builderFor con tipos fluidos)"
```

## Criterio de salida de la Fase 3

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- `Subject`, `@Emits`, `Factory`, `@RegisterIn`, `builderFor` y `Builder<T>` exportados.
- Todo commiteado. La Fase 4 puede empezar.
