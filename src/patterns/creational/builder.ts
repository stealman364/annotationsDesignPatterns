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
        `Método desconocido en el builder: "${prop}". Usa with<Propiedad>(valor) o build()`,
      );
    },
  });
  return proxy as Builder<T>;
}
