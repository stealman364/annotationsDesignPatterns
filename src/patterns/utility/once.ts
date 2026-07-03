/**
 * Ejecuta el método una sola vez por instancia; las llamadas siguientes
 * devuelven el resultado de la primera (incluidos `undefined` y `null`)
 * ignorando los nuevos argumentos.
 *
 * @example
 * ```ts
 * class Setup {
 *   @Once
 *   init(): Config { ... } // solo se ejecuta la primera vez
 * }
 * ```
 */
export function Once<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Once solo puede aplicarse a un método');
  }
  const results = new WeakMap<object, Return>();
  const executed = new WeakSet<object>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    if (!executed.has(self)) {
      results.set(self, target.call(this, ...args));
      executed.add(self);
    }
    return results.get(self) as Return;
  };
}
