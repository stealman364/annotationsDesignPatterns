/** Función que recibe el método original y devuelve su versión envuelta. */
export type MethodWrapper<This, Args extends unknown[], Return> = (
  original: (this: This, ...args: Args) => Return,
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
  wrapper: MethodWrapper<This, Args, Return>,
) {
  return function (
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Decorate solo puede aplicarse a un método');
    }
    return wrapper(target);
  };
}
