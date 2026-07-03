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
