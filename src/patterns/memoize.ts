/**
 * Cachea el resultado del método por combinación de argumentos (clave
 * `JSON.stringify(args)`) y por instancia. Pensado para métodos puros.
 *
 * @example
 * ```ts
 * class Api {
 *   @Memoize
 *   expensiveComputation(n: number): number { ... }
 * }
 * ```
 */
export function Memoize<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Memoize solo puede aplicarse a un método');
  }
  const caches = new WeakMap<object, Map<string, Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let cache = caches.get(self);
    if (!cache) {
      cache = new Map<string, Return>();
      caches.set(self, cache);
    }
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      return cache.get(key) as Return;
    }
    const result = target.call(this, ...args);
    cache.set(key, result);
    return result;
  };
}
