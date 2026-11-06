import { isCount } from '../../core/numeric';
import { adaptOperator } from '../../decorators/adapters';
import { semaphore } from '../../operators/semaphore';
/**
 * Limita a `maxConcurrent` las ejecuciones simultáneas del método asíncrono
 * en la misma instancia (patrón Bulkhead); las llamadas que exceden el
 * límite esperan en cola FIFO. Generaliza `@Mutex` (que equivale a
 * Semaphore(1)). Un fallo libera el hueco con normalidad.
 *
 * @example
 * ```ts
 * class Downloader {
 *   @Semaphore(3) // máximo 3 descargas a la vez
 *   async download(url: string): Promise<Blob> { ... }
 * }
 * ```
 */
export function Semaphore(maxConcurrent: number) {
  if (!isCount(maxConcurrent, 1)) {
    throw new RangeError('@Semaphore requiere al menos 1 ejecución concurrente');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Semaphore solo puede aplicarse a un método');
    }
    const wrapped = adaptOperator<object, Args, Return>(
      () => semaphore<object, Args, Return>({ permits: maxConcurrent }),
      { scope: 'instance', decoratorName: '@Semaphore' },
    )(
      target as (this: object, ...args: Args) => Promise<Return>,
      context as unknown as ClassMethodDecoratorContext<
        object,
        (this: object, ...args: Args) => Promise<Return>
      >,
    );
    return function (this: This, ...args: Args): Promise<Return> {
      try {
        return Promise.resolve(wrapped.call(this as object, ...args));
      } catch (error) {
        // The adapter validates instance receivers synchronously; Semaphore has
        // always exposed invocation failures through a rejected Promise.
        return Promise.reject(error);
      }
    };
  };
}
