/**
 * Serializa las llamadas concurrentes a un método asíncrono en la misma
 * instancia: cada llamada espera a que termine la anterior (cola FIFO),
 * evitando condiciones de carrera. Un fallo no bloquea la cola.
 *
 * @example
 * ```ts
 * class Db {
 *   @Mutex
 *   async write(data: Data): Promise<void> { ... } // nunca en paralelo
 * }
 * ```
 */
export function Mutex<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Promise<Return>,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
): (this: This, ...args: Args) => Promise<Return> {
  if (context.kind !== 'method') {
    throw new TypeError('@Mutex solo puede aplicarse a un método');
  }
  const locks = new WeakMap<object, Promise<unknown>>();
  return function (this: This, ...args: Args): Promise<Return> {
    const self = this as object;
    const previous = locks.get(self) ?? Promise.resolve();
    const run = previous.then(() => target.call(this, ...args));
    locks.set(
      self,
      run.catch(() => undefined),
    );
    return run;
  };
}
