/**
 * Como @Memoize pero con caducidad: cachea el resultado por combinación de
 * argumentos (clave `JSON.stringify(args)`) y por instancia durante `ttlMs`
 * milisegundos; después vuelve a ejecutar el método.
 *
 * Comparte las limitaciones de clave de @Memoize: argumentos circulares
 * lanzan, las funciones/`Symbol` pueden colisionar y el orden de las
 * propiedades de un objeto genera claves distintas. Usa argumentos
 * primitivos u objetos planos estables.
 *
 * @example
 * ```ts
 * class Api {
 *   @CachedFor(60_000) // cache de 1 minuto
 *   fetchConfig(env: string): Config { ... }
 * }
 * ```
 */
export function CachedFor(ttlMs: number) {
  if (ttlMs <= 0) {
    throw new RangeError('@CachedFor requiere un TTL mayor que 0 ms');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@CachedFor solo puede aplicarse a un método');
    }
    const caches = new WeakMap<object, Map<string, { value: Return; expiresAt: number }>>();
    return function (this: This, ...args: Args): Return {
      const self = this as object;
      let cache = caches.get(self);
      if (!cache) {
        cache = new Map<string, { value: Return; expiresAt: number }>();
        caches.set(self, cache);
      }
      const key = JSON.stringify(args);
      const entry = cache.get(key);
      const now = Date.now();
      if (entry && now < entry.expiresAt) {
        return entry.value;
      }
      const value = target.call(this, ...args);
      cache.set(key, { value, expiresAt: now + ttlMs });
      return value;
    };
  };
}
