# Fase 4: @Intercept, @StrategyFor, @Revertible, @Decorate, @Adapt — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices`, `test-driven-development` y `typescript-wizard` (esta fase
> usa genéricos avanzados). Al terminar, invoca `verify`.
> Prerrequisito: Fase 3 completada (`npm test` en verde).

**Goal:** Los cinco patrones más avanzados: `@Intercept` (Proxy/interceptor de métodos), `@StrategyFor` (Strategy con selector), `@Revertible` (Command con historial y deshacer), `@Decorate` (Decorator genérico de métodos) y `@Adapt` (Adapter por alias de métodos).

**Architecture:** Igual que fases anteriores: un archivo por patrón en `src/patterns/`, export en `src/index.ts`, cada patrón con su pieza de runtime si la necesita (`StrategySelector`, `CommandHistory`).

**Tech Stack:** TypeScript 5 (decoradores TC39, genéricos avanzados, mapped types), vitest con `expectTypeOf`.

---

### Task 1: @Intercept (patrón Proxy)

**Files:**
- Create: `src/patterns/intercept.ts`
- Modify: `src/index.ts`
- Test: `tests/intercept.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/intercept.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Intercept, type Invocation } from '../src/patterns/intercept';

describe('@Intercept', () => {
  it('el interceptor puede observar la llamada y delegar con proceed()', () => {
    const log: string[] = [];

    class Api {
      @Intercept<Api, [string], string>((invocation) => {
        log.push(`antes de ${invocation.methodName}(${invocation.args[0]})`);
        const result = invocation.proceed();
        log.push(`después: ${result}`);
        return result;
      })
      greet(name: string): string {
        return `Hola, ${name}`;
      }
    }

    expect(new Api().greet('Ana')).toBe('Hola, Ana');
    expect(log).toEqual(['antes de greet(Ana)', 'después: Hola, Ana']);
  });

  it('el interceptor puede cortocircuitar sin llamar al método original', () => {
    let executed = false;

    class Guarded {
      @Intercept<Guarded, [], string>(() => 'bloqueado')
      secret(): string {
        executed = true;
        return 'dato sensible';
      }
    }

    expect(new Guarded().secret()).toBe('bloqueado');
    expect(executed).toBe(false);
  });

  it('el interceptor puede modificar los argumentos', () => {
    class Math2 {
      @Intercept<Math2, [number], number>((invocation) => {
        invocation.args[0] = Math.abs(invocation.args[0]);
        return invocation.proceed();
      })
      sqrt(n: number): number {
        return Math.sqrt(n);
      }
    }

    expect(new Math2().sqrt(-9)).toBe(3);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/intercept.test.ts`
Expected: FAIL — no existe `src/patterns/intercept.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/intercept.ts`:

```ts
/** Información de una llamada interceptada. */
export interface Invocation<This, Args extends unknown[], Return> {
  /** Nombre del método interceptado. */
  methodName: string;
  /** Argumentos de la llamada (mutables: proceed() usa su valor actual). */
  args: Args;
  /** Instancia sobre la que se llamó al método. */
  instance: This;
  /** Ejecuta el método original con los args actuales y devuelve su resultado. */
  proceed(): Return;
}

export type Interceptor<This, Args extends unknown[], Return> = (
  invocation: Invocation<This, Args, Return>
) => Return;

/**
 * Interpone un interceptor entre el llamante y el método (patrón Proxy).
 * El interceptor decide si delega (`invocation.proceed()`), cortocircuita
 * devolviendo otro valor, o modifica argumentos antes de delegar.
 *
 * @example
 * ```ts
 * class Api {
 *   @Intercept<Api, [string], User>((inv) => {
 *     console.log('llamando', inv.methodName);
 *     return inv.proceed();
 *   })
 *   getUser(id: string): User { ... }
 * }
 * ```
 */
export function Intercept<This, Args extends unknown[], Return>(
  interceptor: Interceptor<This, Args, Return>
) {
  return function (
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Intercept solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      const invocation: Invocation<This, Args, Return> = {
        methodName,
        args,
        instance: this,
        proceed: () => target.call(this, ...invocation.args),
      };
      return interceptor(invocation);
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/intercept.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Intercept, type Interceptor, type Invocation } from './patterns/intercept';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Intercept (patrón Proxy)"
```

### Task 2: @StrategyFor (patrón Strategy)

**Files:**
- Create: `src/patterns/strategy.ts`
- Modify: `src/index.ts`
- Test: `tests/strategy.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/strategy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { StrategyFor, StrategySelector } from '../src/patterns/strategy';

interface Compression {
  compress(data: string): string;
}

describe('StrategySelector + @StrategyFor', () => {
  it('cambia de estrategia en runtime con use()', () => {
    const compression = new StrategySelector<Compression>();

    @StrategyFor(compression, 'zip')
    class Zip implements Compression {
      compress(data: string): string {
        return `zip(${data})`;
      }
    }
    void Zip;

    @StrategyFor(compression, 'gzip')
    class Gzip implements Compression {
      compress(data: string): string {
        return `gzip(${data})`;
      }
    }
    void Gzip;

    compression.use('zip');
    expect(compression.current.compress('x')).toBe('zip(x)');

    compression.use('gzip');
    expect(compression.current.compress('x')).toBe('gzip(x)');
    expect(compression.keys().sort()).toEqual(['gzip', 'zip']);
  });

  it('lanza si se pide una estrategia sin seleccionar antes', () => {
    const selector = new StrategySelector<Compression>();
    expect(() => selector.current).toThrow('No hay estrategia activa');
  });

  it('lanza al seleccionar una clave no registrada', () => {
    const selector = new StrategySelector<Compression>();
    expect(() => selector.use('lz4')).toThrow('Estrategia "lz4" no registrada');
  });

  it('lanza al registrar una clave duplicada', () => {
    const selector = new StrategySelector<Compression>();
    selector.register('zip', { compress: (d) => d });
    expect(() => selector.register('zip', { compress: (d) => d })).toThrow('ya está registrada');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/strategy.test.ts`
Expected: FAIL — no existe `src/patterns/strategy.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/strategy.ts`:

```ts
/**
 * Selector de estrategias intercambiables en runtime (patrón Strategy).
 * Las estrategias se registran con `register` o con el decorador `@StrategyFor`.
 */
export class StrategySelector<S extends object> {
  #strategies = new Map<string, S>();
  #active: string | undefined;

  register(key: string, strategy: S): void {
    if (this.#strategies.has(key)) {
      throw new Error(`La estrategia "${key}" ya está registrada`);
    }
    this.#strategies.set(key, strategy);
  }

  /** Activa la estrategia registrada bajo `key`. */
  use(key: string): void {
    if (!this.#strategies.has(key)) {
      throw new Error(
        `Estrategia "${key}" no registrada. Disponibles: ${this.keys().join(', ') || '(ninguna)'}`
      );
    }
    this.#active = key;
  }

  /** La estrategia activa. Lanza si no se ha llamado antes a use(). */
  get current(): S {
    if (this.#active === undefined) {
      throw new Error('No hay estrategia activa: llama antes a use(clave)');
    }
    return this.#strategies.get(this.#active) as S;
  }

  keys(): string[] {
    return [...this.#strategies.keys()];
  }
}

/**
 * Registra una instancia de la clase decorada (constructor sin argumentos)
 * como estrategia en el selector bajo la clave indicada.
 *
 * @example
 * ```ts
 * const compression = new StrategySelector<Compression>();
 *
 * @StrategyFor(compression, 'zip')
 * class Zip implements Compression { ... }
 *
 * compression.use('zip');
 * compression.current.compress(data);
 * ```
 */
export function StrategyFor<S extends object>(selector: StrategySelector<S>, key: string) {
  return function <T extends new () => S>(target: T, context: ClassDecoratorContext<T>): T {
    if (context.kind !== 'class') {
      throw new TypeError('@StrategyFor solo puede aplicarse a una clase');
    }
    selector.register(key, new target());
    return target;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/strategy.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { StrategyFor, StrategySelector } from './patterns/strategy';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Strategy (StrategySelector y @StrategyFor)"
```

### Task 3: @Revertible (patrón Command)

**Files:**
- Create: `src/patterns/command.ts`
- Modify: `src/index.ts`
- Test: `tests/command.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/command.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CommandHistory, Revertible } from '../src/patterns/command';

describe('CommandHistory + @Revertible', () => {
  it('registra cada llamada y permite deshacerla en orden inverso', () => {
    const history = new CommandHistory();

    class Counter {
      value = 0;

      @Revertible(history, 'decrement')
      increment(amount: number): void {
        this.value += amount;
      }

      decrement(amount: number): void {
        this.value -= amount;
      }
    }

    const counter = new Counter();
    counter.increment(5);
    counter.increment(3);
    expect(counter.value).toBe(8);
    expect(history.size).toBe(2);

    history.undoLast();
    expect(counter.value).toBe(5);
    history.undoLast();
    expect(counter.value).toBe(0);
    expect(history.size).toBe(0);
  });

  it('lanza al deshacer con el historial vacío', () => {
    const history = new CommandHistory();
    expect(() => history.undoLast()).toThrow('No hay comandos que deshacer');
  });

  it('lanza con mensaje claro si el método de deshacer no existe', () => {
    const history = new CommandHistory();

    class Broken {
      @Revertible(history, 'noExiste')
      act(): void {}
    }

    expect(() => new Broken().act()).toThrow('El método de deshacer "noExiste" no existe');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/command.test.ts`
Expected: FAIL — no existe `src/patterns/command.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/command.ts`:

```ts
export interface Command {
  execute(): void;
  undo(): void;
}

/** Historial de comandos ejecutados, con deshacer en orden LIFO (patrón Command). */
export class CommandHistory {
  #done: Command[] = [];

  /** Apunta un comando ya ejecutado. Normalmente lo llama @Revertible. */
  push(command: Command): void {
    this.#done.push(command);
  }

  /** Deshace el último comando. Lanza si el historial está vacío. */
  undoLast(): void {
    const command = this.#done.pop();
    if (!command) {
      throw new Error('No hay comandos que deshacer');
    }
    command.undo();
  }

  get size(): number {
    return this.#done.length;
  }
}

/**
 * Convierte cada llamada al método en un comando desechable: se ejecuta
 * normalmente y se apunta en el historial junto con su inversa
 * (`undoMethod`, otro método de la misma clase que recibe los MISMOS
 * argumentos y revierte el efecto).
 *
 * @example
 * ```ts
 * const history = new CommandHistory();
 * class Counter {
 *   @Revertible(history, 'decrement')
 *   increment(n: number): void { this.value += n; }
 *   decrement(n: number): void { this.value -= n; }
 * }
 * history.undoLast(); // revierte el último increment
 * ```
 */
export function Revertible(history: CommandHistory, undoMethod: string) {
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Revertible solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const undoFn = (this as Record<string, unknown>)[undoMethod];
      if (typeof undoFn !== 'function') {
        throw new TypeError(
          `El método de deshacer "${undoMethod}" no existe en la clase decorada con @Revertible`
        );
      }
      const result = target.call(this, ...args);
      history.push({
        execute: () => {
          target.call(this, ...args);
        },
        undo: () => {
          (undoFn as (this: This, ...a: Args) => unknown).call(this, ...args);
        },
      });
      return result;
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/command.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { CommandHistory, Revertible, type Command } from './patterns/command';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: patrón Command (CommandHistory y @Revertible)"
```

### Task 4: @Decorate (patrón Decorator)

**Files:**
- Create: `src/patterns/decorate.ts`
- Modify: `src/index.ts`
- Test: `tests/decorate.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/decorate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Decorate, type MethodWrapper } from '../src/patterns/decorate';

const withLogging = (log: string[]): MethodWrapper<unknown, [number, number], number> => {
  return (original) =>
    function (...args) {
      log.push(`args: ${args.join(',')}`);
      const result = original.apply(this, args);
      log.push(`result: ${result}`);
      return result;
    };
};

describe('@Decorate', () => {
  it('envuelve el método con el wrapper', () => {
    const log: string[] = [];

    class Calc {
      @Decorate(withLogging(log))
      add(a: number, b: number): number {
        return a + b;
      }
    }

    expect(new Calc().add(2, 3)).toBe(5);
    expect(log).toEqual(['args: 2,3', 'result: 5']);
  });

  it('se pueden apilar varios @Decorate (el más cercano al método se aplica primero)', () => {
    const order: string[] = [];
    const tag =
      (name: string): MethodWrapper<unknown, [], void> =>
      (original) =>
        function () {
          order.push(name);
          original.apply(this);
        };

    class Task {
      @Decorate(tag('externo'))
      @Decorate(tag('interno'))
      run(): void {
        order.push('método');
      }
    }

    new Task().run();
    expect(order).toEqual(['externo', 'interno', 'método']);
  });

  it('preserva this', () => {
    class Greeter {
      name = 'Ana';

      @Decorate<Greeter, [], string>((original) =>
        function () {
          return `[${original.apply(this)}]`;
        }
      )
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter().greet()).toBe('[Hola, Ana]');
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/decorate.test.ts`
Expected: FAIL — no existe `src/patterns/decorate.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/decorate.ts`:

```ts
/** Función que recibe el método original y devuelve su versión envuelta. */
export type MethodWrapper<This, Args extends unknown[], Return> = (
  original: (this: This, ...args: Args) => Return
) => (this: This, ...args: Args) => Return;

/**
 * Aplica el patrón Decorator a un método: lo sustituye por la versión
 * envuelta que devuelve `wrapper`. Se pueden apilar varios; el más cercano
 * al método se aplica primero (queda más adentro).
 *
 * @example
 * ```ts
 * const logged: MethodWrapper<unknown, unknown[], unknown> = (original) =>
 *   function (...args) {
 *     console.log('llamada con', args);
 *     return original.apply(this, args);
 *   };
 *
 * class Service {
 *   @Decorate(logged)
 *   work(): void { ... }
 * }
 * ```
 */
export function Decorate<This, Args extends unknown[], Return>(
  wrapper: MethodWrapper<This, Args, Return>
) {
  return function (
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Decorate solo puede aplicarse a un método');
    }
    return wrapper(target);
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/decorate.test.ts`
Expected: PASS (3 tests).

Nota de rescate: si `npm run typecheck` falla por la inferencia del genérico `This`
al aplicar `@Decorate`, especifica los genéricos explícitamente en el punto de uso,
p. ej. `@Decorate<Calc, [number, number], number>(...)`. No cambies la firma de
`Decorate` ni de `MethodWrapper`.

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final:

```ts
export { Decorate, type MethodWrapper } from './patterns/decorate';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Decorate (patrón Decorator)"
```

### Task 5: @Adapt (patrón Adapter)

**Files:**
- Create: `src/patterns/adapt.ts`
- Modify: `src/index.ts`
- Test: `tests/adapt.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/adapt.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Adapt, type Adapted } from '../src/patterns/adapt';

describe('@Adapt', () => {
  it('expone los métodos existentes bajo los alias indicados', () => {
    @Adapt({ send: 'postMessage', close: 'disconnect' })
    class LegacySocket {
      log: string[] = [];
      postMessage(data: string): void {
        this.log.push(`post:${data}`);
      }
      disconnect(): void {
        this.log.push('bye');
      }
    }

    const socket = new LegacySocket() as Adapted<
      LegacySocket,
      { send: 'postMessage'; close: 'disconnect' }
    >;

    socket.send('hola');
    socket.close();
    expect(socket.log).toEqual(['post:hola', 'bye']);
  });

  it('lanza en tiempo de decoración si el método origen no existe', () => {
    expect(() => {
      @Adapt({ send: 'noExiste' })
      class Broken {}
      void Broken;
    }).toThrow('No existe el método "noExiste"');
  });

  it('el tipo Adapted expone los alias con la firma del método original', () => {
    class Legacy {
      postMessage(data: string): number {
        return data.length;
      }
    }

    type Modern = Adapted<Legacy, { send: 'postMessage' }>;
    expectTypeOf<Modern['send']>().toEqualTypeOf<Legacy['postMessage']>();
    expectTypeOf<Modern['postMessage']>().toEqualTypeOf<Legacy['postMessage']>();
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/adapt.test.ts`
Expected: FAIL — no existe `src/patterns/adapt.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/adapt.ts`:

```ts
/**
 * Tipo de una instancia adaptada: la original más un alias por cada entrada
 * del mapeo, con la firma del método original.
 */
export type Adapted<T, M extends Record<string, keyof T>> = T & {
  [K in keyof M]: T[M[K]];
};

/**
 * Patrón Adapter: expone métodos existentes de la clase bajo nombres nuevos
 * (alias), para cumplir la interfaz que espera otro código sin reescribir
 * la clase. El mapeo es `{ aliasNuevo: 'metodoExistente' }`.
 *
 * Los alias existen en runtime; para que el sistema de tipos los vea,
 * castea la instancia con el tipo `Adapted<Clase, Mapeo>` (los decoradores
 * TC39 no pueden ampliar el tipo de la clase).
 *
 * @example
 * ```ts
 * @Adapt({ send: 'postMessage' })
 * class LegacySocket {
 *   postMessage(data: string): void { ... }
 * }
 * const s = new LegacySocket() as Adapted<LegacySocket, { send: 'postMessage' }>;
 * s.send('hola');
 * ```
 */
export function Adapt(aliases: Record<string, string>) {
  return function <T extends new (...args: any[]) => object>(
    target: T,
    context: ClassDecoratorContext<T>
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@Adapt solo puede aplicarse a una clase');
    }
    const prototype = target.prototype as Record<string, unknown>;
    for (const [alias, existing] of Object.entries(aliases)) {
      const method = prototype[existing];
      if (typeof method !== 'function') {
        throw new TypeError(
          `No existe el método "${existing}" en la clase para adaptarlo como "${alias}"`
        );
      }
      Object.defineProperty(target.prototype, alias, {
        value: method,
        writable: true,
        configurable: true,
      });
    }
    return target;
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/adapt.test.ts`
Expected: PASS (3 tests).

- [x] **Step 5: Exportar, suite completa, build y commit**

En `src/index.ts`, añade al final:

```ts
export { Adapt, type Adapted } from './patterns/adapt';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, `dist/patterns/` contiene los 5 patrones nuevos.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @Adapt (patrón Adapter)"
```

## Criterio de salida de la Fase 4 (y del proyecto v1)

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- Los 15 símbolos públicos exportados desde `src/index.ts`:
  `Singleton`, `Memoize`, `Frozen`, `Debounce`, `Throttle`, `Retry`, `Lazy`,
  `Subject`, `Emits`, `Factory`, `RegisterIn`, `builderFor`, `Intercept`,
  `StrategySelector`/`StrategyFor`, `CommandHistory`/`Revertible`, `Decorate`, `Adapt`.
- Todo commiteado. La librería v1 está completa según la especificación.
