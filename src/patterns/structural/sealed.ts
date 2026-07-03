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
  context: ClassDecoratorContext<T>,
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
