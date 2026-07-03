/**
 * Evalúa el getter una sola vez por instancia y cachea el resultado
 * (incluidos `undefined` y `null`). Inicialización perezosa.
 *
 * @example
 * ```ts
 * class Report {
 *   @Lazy
 *   get summary(): string { return computeExpensiveSummary(); }
 * }
 * ```
 */
export function Lazy<This, Return>(
  target: (this: This) => Return,
  context: ClassGetterDecoratorContext<This, Return>,
): (this: This) => Return {
  if (context.kind !== 'getter') {
    throw new TypeError('@Lazy solo puede aplicarse a un getter');
  }
  const cache = new WeakMap<object, Return>();
  const computed = new WeakSet<object>();
  return function (this: This): Return {
    const self = this as object;
    if (!computed.has(self)) {
      cache.set(self, target.call(this));
      computed.add(self);
    }
    return cache.get(self) as Return;
  };
}
