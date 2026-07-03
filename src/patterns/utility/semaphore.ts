/**
 * Limita a `maxConcurrent` las ejecuciones simultáneas del método asíncrono
 * en la misma instancia (patrón Bulkhead); las llamadas que exceden el
 * límite esperan en cola FIFO. Generaliza @Mutex (que equivale a
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
  if (maxConcurrent < 1) {
    throw new RangeError('@Semaphore requiere al menos 1 ejecución concurrente');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Semaphore solo puede aplicarse a un método');
    }
    const states = new WeakMap<object, { active: number; queue: Array<() => void> }>();
    return async function (this: This, ...args: Args): Promise<Return> {
      const self = this as object;
      let state = states.get(self);
      if (!state) {
        state = { active: 0, queue: [] };
        states.set(self, state);
      }
      const s = state;
      if (s.active >= maxConcurrent) {
        await new Promise<void>((resolve) => s.queue.push(resolve));
      }
      s.active++;
      try {
        return await target.call(this, ...args);
      } finally {
        s.active--;
        s.queue.shift()?.();
      }
    };
  };
}
