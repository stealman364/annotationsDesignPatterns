/**
 * Limita el tiempo de un método asíncrono: si no resuelve en `ms`
 * milisegundos, la promesa devuelta rechaza con `Error`. El método original
 * sigue ejecutándose en segundo plano (JavaScript no permite cancelarlo),
 * pero su resultado se descarta.
 *
 * @example
 * ```ts
 * class Api {
 *   @Timeout(5000)
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Timeout(ms: number) {
  if (ms <= 0) {
    throw new RangeError('@Timeout requiere un límite mayor que 0 ms');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Timeout solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return async function (this: This, ...args: Args): Promise<Return> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const limit = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`El método ${methodName} superó el límite de ${ms} ms`)),
          ms
        );
      });
      try {
        return await Promise.race([target.call(this, ...args), limit]);
      } finally {
        clearTimeout(timer);
      }
    };
  };
}
