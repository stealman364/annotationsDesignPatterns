import { assertObjectReceiver } from '../../core/receiver';
import { isCount, isDuration } from '../../core/numeric';
/**
 * Limita el método a `maxCalls` ejecuciones por ventana deslizante de
 * `windowMs` milisegundos, por instancia. Las llamadas que exceden el
 * límite se descartan en silencio. El método debe devolver `void`.
 * Generalización de `@Throttle` (que equivale a RateLimit(1, intervalo)).
 *
 * @example
 * ```ts
 * class Notifier {
 *   @RateLimit(5, 60_000) // máximo 5 avisos por minuto
 *   send(message: string): void { ... }
 * }
 * ```
 */
export function RateLimit(maxCalls: number, windowMs: number) {
  if (!isCount(maxCalls, 1)) {
    throw new RangeError('@RateLimit requiere al menos 1 llamada por ventana');
  }
  if (!isDuration(windowMs, false)) {
    throw new RangeError('@RateLimit requiere una ventana mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>,
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@RateLimit solo puede aplicarse a un método');
    }
    const timestamps = new WeakMap<object, number[]>();
    return function (this: This, ...args: Args): void {
      assertObjectReceiver(this, '@RateLimit');
      const now = Date.now();
      const recent = (timestamps.get(this) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxCalls) {
        timestamps.set(this, recent);
        return;
      }
      recent.push(now);
      timestamps.set(this, recent);
      target.call(this, ...args);
    };
  };
}
