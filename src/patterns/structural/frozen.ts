/**
 * Congela (`Object.freeze`) cada instancia inmediatamente después de
 * construirla: las propiedades no pueden modificarse ni añadirse.
 * Nota: no uses @Frozen en clases pensadas para ser extendidas, porque
 * las subclases no podrán inicializar sus propios campos.
 *
 * @example
 * ```ts
 * @Frozen
 * class Point {
 *   constructor(public x: number, public y: number) {}
 * }
 * ```
 */
export function Frozen<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>,
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Frozen solo puede aplicarse a una clase');
  }
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const instance = Reflect.construct(original, args, newTarget) as object;
      return Object.freeze(instance);
    },
  });
}
