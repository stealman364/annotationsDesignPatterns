/** Información de una llamada interceptada. */
export interface Invocation<This, Args extends unknown[], Return> {
  /** Nombre del método interceptado. */
  methodName: string;
  /** Argumentos de la llamada (mutables: proceed() usa su valor actual). */
  args: Args;
  /** Instancia sobre la que se llamó al método. */
  instance: This;
  /** Ejecuta el método original con los args actuales y devuelve su resultado. */
  proceed(): Return;
}

export type Interceptor<This, Args extends unknown[], Return> = (
  invocation: Invocation<This, Args, Return>,
) => Return;

/**
 * Interpone un interceptor entre el llamante y el método (patrón Proxy).
 * El interceptor decide si delega (`invocation.proceed()`), cortocircuita
 * devolviendo otro valor, o modifica argumentos antes de delegar.
 *
 * @example
 * ```ts
 * class Api {
 *   @Intercept<Api, [string], User>((inv) => {
 *     console.log('llamando', inv.methodName);
 *     return inv.proceed();
 *   })
 *   getUser(id: string): User { ... }
 * }
 * ```
 */
export function Intercept<This, Args extends unknown[], Return>(
  interceptor: Interceptor<This, Args, Return>,
) {
  return function (
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Intercept solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      const invocation: Invocation<This, Args, Return> = {
        methodName,
        args,
        instance: this,
        proceed: () => target.call(this, ...invocation.args),
      };
      return interceptor(invocation);
    };
  };
}
