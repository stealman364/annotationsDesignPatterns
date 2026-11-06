import { assertObjectReceiver } from '../../core/receiver';
import { isDuration } from '../../core/numeric';
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
  if (!isDuration(intervalMs, false)) {
    throw new RangeError('@Throttle requiere un intervalo mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>,
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@Throttle solo puede aplicarse a un método');
    }
    const lastRun = new WeakMap<object, number>();
    return function (this: This, ...args: Args): void {
      assertObjectReceiver(this, '@Throttle');
      const now = Date.now();
      const previous = lastRun.get(this);
      if (previous !== undefined && now - previous < intervalMs) {
        return;
      }
      lastRun.set(this, now);
      target.call(this, ...args);
    };
  };
}
