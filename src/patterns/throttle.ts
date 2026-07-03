/**
 * Limita la frecuencia de ejecución: la primera llamada se ejecuta
 * inmediatamente y las siguientes se descartan hasta que pasen
 * `intervalMs` milisegundos.
 *
 * @example
 * ```ts
 * class Scroller {
 *   @Throttle(100)
 *   onScroll(): void { ... }
 * }
 * ```
 */
export function Throttle(intervalMs: number) {
  if (intervalMs <= 0) {
    throw new RangeError('@Throttle requiere un intervalo mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@Throttle solo puede aplicarse a un método');
    }
    const lastRun = new WeakMap<object, number>();
    return function (this: This, ...args: Args): void {
      const self = this as object;
      const now = Date.now();
      const previous = lastRun.get(self);
      if (previous !== undefined && now - previous < intervalMs) {
        return;
      }
      lastRun.set(self, now);
      target.call(this, ...args);
    };
  };
}
