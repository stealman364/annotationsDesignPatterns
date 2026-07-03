/**
 * Liga el método a su instancia (`this`) al construirla, de modo que puede
 * desestructurarse o pasarse como callback sin perder el contexto.
 *
 * @example
 * ```ts
 * class Handler {
 *   @Bind
 *   onClick(): void { this.process(); }
 * }
 * button.addEventListener('click', new Handler().onClick); // this correcto
 * ```
 */
export function Bind<This extends object, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
): void {
  if (context.kind !== 'method') {
    throw new TypeError('@Bind solo puede aplicarse a un método');
  }
  const methodName = context.name;
  context.addInitializer(function (this: This) {
    const method = (this as Record<PropertyKey, unknown>)[methodName] as (
      this: This,
      ...args: Args
    ) => Return;
    Object.defineProperty(this, methodName, {
      value: method.bind(this),
      writable: true,
      configurable: true,
    });
  });
  void target;
}
