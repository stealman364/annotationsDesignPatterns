/**
 * Marca el método como obsoleto: la primera vez que se usa (en total, no por
 * instancia) emite un aviso por `console.warn` y después ejecuta el método
 * con normalidad.
 *
 * @example
 * ```ts
 * class Api {
 *   @Deprecated('usa fetchUserV2()')
 *   fetchUser(id: string): User { ... }
 * }
 * ```
 */
export function Deprecated(message?: string) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Deprecated solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    let warned = false;
    return function (this: This, ...args: Args): Return {
      if (!warned) {
        warned = true;
        console.warn(`[deprecated] ${methodName}: ${message ?? 'este método está obsoleto'}`);
      }
      return target.call(this, ...args);
    };
  };
}
