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
  if (delayMs <= 0) {
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
      const self = this as object;
      const pending = timers.get(self);
      if (pending !== undefined) {
        clearTimeout(pending);
      }
      timers.set(
        self,
        setTimeout(() => {
          timers.delete(self);
          target.call(this, ...args);
        }, delayMs),
      );
    };
  };
}
