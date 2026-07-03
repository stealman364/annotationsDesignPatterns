/**
 * Si el método asíncrono rechaza, devuelve el valor de respaldo en lugar de
 * propagar el error. El respaldo puede ser un valor directo o una función
 * `(error, ...argsOriginales) => valor | Promise<valor>` (las funciones se
 * tratan SIEMPRE como proveedor, nunca como valor).
 *
 * Nota de tipado: `fallback` se tipa como `unknown` porque las factorías de
 * decoradores fijan sus genéricos antes de conocer el método decorado; es
 * responsabilidad del llamante que el respaldo sea compatible con el tipo
 * de retorno. Combínalo con @Retry/@Timeout/@CircuitBreaker para completar
 * la cadena de resiliencia.
 *
 * @example
 * ```ts
 * class Api {
 *   @Fallback([])
 *   async fetchItems(): Promise<Item[]> { ... }
 *
 *   @Fallback((error, id: string) => cache.get(id))
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Fallback(fallback: unknown) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Fallback solo puede aplicarse a un método');
    }
    return async function (this: This, ...args: Args): Promise<Return> {
      try {
        return await target.call(this, ...args);
      } catch (error) {
        const value =
          typeof fallback === 'function'
            ? await (fallback as (error: unknown, ...args: Args) => unknown)(error, ...args)
            : fallback;
        return value as Return;
      }
    };
  };
}
