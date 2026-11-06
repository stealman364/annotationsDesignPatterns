import { assertObjectReceiver } from '../../core/receiver';
import { isTimerDelay } from '../../core/numeric';
/**
 * Retrasa la ejecución del método hasta que pasen `delayMs` milisegundos sin
 * nuevas llamadas; solo se ejecuta la última. El método debe devolver `void`
 * (el resultado se perdería al ser asíncrono).
 *
 * @example
 * ```ts
 * class Search {
 *   @Debounce(300)
 *   query(text: string): void { ... }
 * }
 * ```
 */
export function Debounce(delayMs: number) {
  if (!isTimerDelay(delayMs, false)) {
    throw new RangeError('@Debounce requiere un retardo mayor que 0 ms');
  }
  return function <This, Args extends unknown[]>(
    target: (this: This, ...args: Args) => void,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => void>,
  ): (this: This, ...args: Args) => void {
    if (context.kind !== 'method') {
      throw new TypeError('@Debounce solo puede aplicarse a un método');
    }
    const timers = new WeakMap<object, ReturnType<typeof setTimeout>>();
    return function (this: This, ...args: Args): void {
      assertObjectReceiver(this, '@Debounce');
      const pending = timers.get(this);
      if (pending !== undefined) {
        clearTimeout(pending);
      }
      timers.set(
        this,
        setTimeout(() => {
          timers.delete(this);
          target.call(this, ...args);
        }, delayMs),
      );
    };
  };
}
