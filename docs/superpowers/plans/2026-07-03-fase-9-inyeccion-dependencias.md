# Fase 9: Inyección de dependencias — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices`, `test-driven-development` y `typescript-wizard`.
> Al terminar, invoca `verify`. Prerrequisito: `npm test` con 137 tests, `npm run lint`
> y `npm run format:check` en verde.
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`).

**Goal:** Mini-contenedor de inyección de dependencias 100 % TC39: `Container` (scopes singleton/transient, providers `useValue`/`useFactory`/`useClass`), `InjectionToken<T>` para interfaces, `@Injectable` (registra la clase) y `@Inject` (decorador de CAMPO que resuelve la dependencia al construir).

**Architecture:** Un solo módulo `src/patterns/creational/injection.ts`. Inyección por CAMPOS, no por constructor (los decoradores de parámetros no existen en TC39). Contenedores explícitos, sin estado global (mismo estilo que `Factory` y `StrategySelector`). `@Inject` usa el mecanismo de decorador de campo TC39: devuelve una función que sustituye el valor inicial del campo en cada construcción. Sin detección de ciclos (documentado en JSDoc).

**Tech Stack:** TypeScript 5 (decoradores TC39 de clase Y de campo), vitest con `expectTypeOf`.

---

### Task 1: Container, InjectionToken, @Injectable y @Inject

**Files:**
- Create: `src/patterns/creational/injection.ts`
- Modify: `src/index.ts`
- Test: `tests/injection.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/injection.test.ts`:

```ts
import { describe, expect, expectTypeOf, it } from 'vitest';
import { Container, Inject, Injectable, InjectionToken } from '../src/patterns/creational/injection';

interface Config {
  apiUrl: string;
}

describe('Container', () => {
  it('resuelve un useValue con su tipo', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    const config = container.resolve(CONFIG);
    expect(config.apiUrl).toBe('https://api');
    expectTypeOf(config).toEqualTypeOf<Config>();
  });

  it('useClass con scope singleton (por defecto) cachea la instancia', () => {
    const container = new Container();
    class Db {}
    container.register(Db, { useClass: Db });

    expect(container.resolve(Db)).toBe(container.resolve(Db));
  });

  it('scope transient crea una instancia por resolución', () => {
    const container = new Container();
    class Db {}
    container.register(Db, { useClass: Db, scope: 'transient' });

    expect(container.resolve(Db)).not.toBe(container.resolve(Db));
  });

  it('useFactory ejecuta la fábrica según el scope', () => {
    const container = new Container();
    const N = new InjectionToken<number>('n');
    let built = 0;
    container.register(N, { useFactory: () => ++built, scope: 'transient' });

    expect(container.resolve(N)).toBe(1);
    expect(container.resolve(N)).toBe(2);
  });

  it('lanza con mensaje claro si el token no está registrado', () => {
    const container = new Container();
    const MISSING = new InjectionToken<string>('missing');

    expect(() => container.resolve(MISSING)).toThrow('Token "missing" no registrado');
  });

  it('lanza al registrar dos veces el mismo token', () => {
    const container = new Container();
    const T = new InjectionToken<number>('t');
    container.register(T, { useValue: 1 });

    expect(() => container.register(T, { useValue: 2 })).toThrow('ya está registrado');
  });
});

describe('@Injectable + @Inject', () => {
  it('inyecta dependencias en campos al construir', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    @Injectable(container)
    class Repo {
      @Inject(container, CONFIG)
      config!: Config;
    }

    const repo = container.resolve(Repo);
    expect(repo.config.apiUrl).toBe('https://api');
  });

  it('@Injectable registra la clase como singleton por defecto', () => {
    const container = new Container();

    @Injectable(container)
    class Service {}

    expect(container.resolve(Service)).toBe(container.resolve(Service));
  });

  it('@Injectable con scope transient', () => {
    const container = new Container();

    @Injectable(container, { scope: 'transient' })
    class Service {}

    expect(container.resolve(Service)).not.toBe(container.resolve(Service));
  });

  it('cablea un grafo: servicio → repo → config', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    @Injectable(container)
    class Repo {
      @Inject(container, CONFIG)
      config!: Config;
    }

    @Injectable(container)
    class Service {
      @Inject(container, Repo)
      repo!: Repo;
    }

    expect(container.resolve(Service).repo.config.apiUrl).toBe('https://api');
  });

  it('@Inject también funciona en clases instanciadas con new manual', () => {
    const container = new Container();
    const N = new InjectionToken<number>('n');
    container.register(N, { useValue: 42 });

    class Plain {
      @Inject(container, N)
      n!: number;
    }

    expect(new Plain().n).toBe(42);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/injection.test.ts`
Expected: FAIL — no existe `src/patterns/creational/injection.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/creational/injection.ts`:

```ts
/** Ciclo de vida de una dependencia: instancia única o una por resolución. */
export type Scope = 'singleton' | 'transient';

/**
 * Token tipado para registrar valores que no son clases (interfaces,
 * primitivos, configuración). El tipo `T` es phantom: solo existe para que
 * `resolve` devuelva el tipo correcto.
 */
export class InjectionToken<T> {
  declare readonly __type: T;
  constructor(readonly description: string) {}
}

/** Un token es una clase (se resuelve a su instancia) o un InjectionToken. */
export type Token<T> = InjectionToken<T> | (new () => T);

type Provider<T> =
  | { useValue: T }
  | { useFactory: () => T; scope?: Scope }
  | { useClass: new () => T; scope?: Scope };

interface Registration {
  factory: () => unknown;
  scope: Scope;
}

function describeToken(token: unknown): string {
  if (token instanceof InjectionToken) {
    return token.description;
  }
  if (typeof token === 'function') {
    return token.name || '(clase anónima)';
  }
  return String(token);
}

/**
 * Contenedor de inyección de dependencias 100 % TC39 (sin
 * `experimentalDecorators` ni `reflect-metadata`). Las dependencias se
 * inyectan por CAMPOS con @Inject; las clases se registran con @Injectable
 * o manualmente con `register`.
 *
 * Limitación: no detecta ciclos (A inyecta B y B inyecta A desborda la
 * pila); rompe el ciclo con un useFactory o rediseña el grafo.
 *
 * @example
 * ```ts
 * const container = new Container();
 * const CONFIG = new InjectionToken<Config>('config');
 * container.register(CONFIG, { useValue: { apiUrl: '...' } });
 *
 * @Injectable(container)
 * class Repo {
 *   @Inject(container, CONFIG)
 *   private config!: Config;
 * }
 *
 * container.resolve(Repo);
 * ```
 */
export class Container {
  #registrations = new Map<unknown, Registration>();
  #singletons = new Map<unknown, unknown>();

  /** Registra un provider para el token. Lanza si el token ya está registrado. */
  register<T>(token: Token<T>, provider: Provider<T>): void {
    if (this.#registrations.has(token)) {
      throw new Error(`El token "${describeToken(token)}" ya está registrado en el contenedor`);
    }
    if ('useValue' in provider) {
      this.#registrations.set(token, { factory: () => provider.useValue, scope: 'singleton' });
      return;
    }
    if ('useFactory' in provider) {
      this.#registrations.set(token, {
        factory: provider.useFactory,
        scope: provider.scope ?? 'singleton',
      });
      return;
    }
    this.#registrations.set(token, {
      factory: () => new provider.useClass(),
      scope: provider.scope ?? 'singleton',
    });
  }

  /** Resuelve el token según su scope. Lanza si no está registrado. */
  resolve<T>(token: Token<T>): T {
    const registration = this.#registrations.get(token);
    if (!registration) {
      throw new Error(`Token "${describeToken(token)}" no registrado en el contenedor`);
    }
    if (registration.scope === 'singleton') {
      if (!this.#singletons.has(token)) {
        this.#singletons.set(token, registration.factory());
      }
      return this.#singletons.get(token) as T;
    }
    return registration.factory() as T;
  }

  has(token: Token<unknown>): boolean {
    return this.#registrations.has(token);
  }
}

/**
 * Registra la clase decorada en el contenedor (por defecto como singleton).
 * La clase debe tener constructor sin argumentos: sus dependencias se
 * declaran como campos con @Inject.
 *
 * @example ver Container
 */
export function Injectable(container: Container, options: { scope?: Scope } = {}) {
  return function <T extends new () => object>(target: T, context: ClassDecoratorContext<T>): T {
    if (context.kind !== 'class') {
      throw new TypeError('@Injectable solo puede aplicarse a una clase');
    }
    container.register(target, { useClass: target, scope: options.scope });
    return target;
  };
}

/**
 * Decorador de CAMPO: al construir cada instancia, el campo se inicializa
 * resolviendo el token en el contenedor (resolución eager). Funciona tanto
 * en clases registradas con @Injectable como en clases instanciadas a mano.
 *
 * @example ver Container
 */
export function Inject<T>(container: Container, token: Token<T>) {
  return function <This>(
    _target: undefined,
    context: ClassFieldDecoratorContext<This, T>,
  ): (this: This, initialValue: T) => T {
    if (context.kind !== 'field') {
      throw new TypeError('@Inject solo puede aplicarse a un campo');
    }
    return function (this: This): T {
      return container.resolve(token);
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/injection.test.ts`
Expected: PASS (11 tests).

- [x] **Step 5: Exportar, suite completa, lint, build y commit**

En `src/index.ts`, añade al final del bloque `// Creacionales`:

```ts
export {
  Container,
  Inject,
  Injectable,
  InjectionToken,
  type Scope,
  type Token,
} from './patterns/creational/injection';
```

Run: `npm test` — Expected: PASS (148 tests).
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run format` — aplica el formato.
Run: `npm run lint` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores, con `injection.*` en `dist/patterns/creational/`.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: inyeccion de dependencias TC39 (Container, InjectionToken, @Injectable, @Inject)"
```

## Criterio de salida de la Fase 9

- `npm test` (148 tests), `npm run typecheck`, `npm run lint`, `npm run format:check`
  y `npm run build` en verde.
- Exports nuevos: `Container`, `InjectionToken`, `Injectable`, `Inject`, `Scope`, `Token`.
- Todo commiteado. La Fase 10 puede empezar.
