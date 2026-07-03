import type { KeyResolver } from './memoize';

export interface CachedForOptions {
  /**
   * Genera la clave de cache a partir de los argumentos, en sustitución del
   * `JSON.stringify(args)` por defecto. Tipa sus parámetros manualmente: el
   * compilador no los cruza con los del método decorado.
   */
  key?: KeyResolver;
}

/**
 * Como @Memoize pero con caducidad: cachea el resultado por combinación de
 * argumentos y por instancia durante `ttlMs` milisegundos; después vuelve a
 * ejecutar el método.
 *
 * La clave por defecto es `JSON.stringify(args)` y comparte las limitaciones
 * de @Memoize (circulares lanzan, funciones/`Symbol` colisionan, el orden de
 * propiedades genera claves distintas); para esos casos aporta tu propio
 * resolver con la opción `key`.
 *
 * @example
 * ```ts
 * class Api {
 *   @CachedFor(60_000) // cache de 1 minuto
 *   fetchConfig(env: string): Config { ... }
 *
 *   @CachedFor(60_000, { key: (user: User) => user.id })
 *   loadProfile(user: User): Profile { ... }
 * }
 * ```
 */
export function CachedFor(ttlMs: number, options: CachedForOptions = {}) {
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
    const computeKey =
      (options.key as ((...args: Args) => string) | undefined) ??
      ((...args: Args) => JSON.stringify(args));
    const caches = new WeakMap<object, Map<string, { value: Return; expiresAt: number }>>();
    return function (this: This, ...args: Args): Return {
      const self = this as object;
      let cache = caches.get(self);
      if (!cache) {
        cache = new Map<string, { value: Return; expiresAt: number }>();
        caches.set(self, cache);
      }
      const cacheKey = computeKey(...args);
      const entry = cache.get(cacheKey);
      const now = Date.now();
      if (entry && now < entry.expiresAt) {
        return entry.value;
      }
      const value = target.call(this, ...args);
      cache.set(cacheKey, { value, expiresAt: now + ttlMs });
      return value;
    };
  };
}
