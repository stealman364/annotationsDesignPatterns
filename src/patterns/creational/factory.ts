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
        `Clave "${key}" no registrada en la factoría. Disponibles: ${this.keys().join(', ') || '(ninguna)'}`,
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
