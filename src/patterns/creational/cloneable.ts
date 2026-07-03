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
  context: ClassDecoratorContext<T>,
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
