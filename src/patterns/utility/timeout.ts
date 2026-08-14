import { TimeoutError, timeout } from '../../operators/timeout';
import { adaptOperator } from '../../decorators/adapters';

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
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    return adaptOperator<This, Args, Return>(
      (operatorContext) => {
        const methodName = String(operatorContext.name);
        return timeout<This, Args, Return>(
          ms,
          () => new TimeoutError(ms, `El método ${methodName} superó el límite de ${ms} ms`),
        );
      },
      { decoratorName: '@Timeout' },
    )(target, context);
  };
}
