/** Resolver de clave de cache: recibe los argumentos del método y devuelve la clave. */
export type KeyResolver = (...args: never[]) => string;

export interface MemoizeOptions {
  /**
   * Genera la clave de cache a partir de los argumentos, en sustitución del
   * `JSON.stringify(args)` por defecto. Tipa sus parámetros manualmente: el
   * compilador no los cruza con los del método decorado.
   */
  key?: KeyResolver;
}

/**
 * Cachea el resultado del método por combinación de argumentos y por
 * instancia. Pensado para métodos puros. Puede usarse directo (`@Memoize`)
 * o con opciones (`@Memoize({ key })`).
 *
 * La clave por defecto es `JSON.stringify(args)`, con limitaciones:
 * - lanza con argumentos que contengan referencias circulares;
 * - las funciones y los `Symbol` se serializan como nada (`undefined`),
 *   así que argumentos distintos pueden COLISIONAR en la misma entrada;
 * - `{a:1, b:2}` y `{b:2, a:1}` generan claves distintas (el orden de las
 *   propiedades importa).
 * Para esos casos, aporta tu propio resolver con la opción `key`, o usa
 * @MemoizeByRef si prefieres comparar los argumentos por referencia.
 *
 * @example
 * ```ts
 * class Api {
 *   @Memoize
 *   expensiveComputation(n: number): number { ... }
 *
 *   @Memoize({ key: (user: User) => user.id })
 *   permissions(user: User): Permission[] { ... }
 * }
 * ```
 */
export function Memoize<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return;
export function Memoize(
  options?: MemoizeOptions,
): <This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
) => (this: This, ...args: Args) => Return;
export function Memoize(targetOrOptions?: unknown, maybeContext?: unknown): unknown {
  if (typeof targetOrOptions === 'function' && maybeContext !== undefined) {
    return memoizeMethod(
      targetOrOptions as (this: object, ...args: unknown[]) => unknown,
      maybeContext as ClassMethodDecoratorContext<
        object,
        (this: object, ...args: unknown[]) => unknown
      >,
      undefined,
    );
  }
  const options = (targetOrOptions ?? {}) as MemoizeOptions;
  return <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ) => memoizeMethod(target, context, options.key as ((...args: Args) => string) | undefined);
}

function memoizeMethod<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  key: ((...args: Args) => string) | undefined,
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@Memoize solo puede aplicarse a un método');
  }
  const computeKey = key ?? ((...args: Args) => JSON.stringify(args));
  const caches = new WeakMap<object, Map<string, Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let cache = caches.get(self);
    if (!cache) {
      cache = new Map<string, Return>();
      caches.set(self, cache);
    }
    const cacheKey = computeKey(...args);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) as Return;
    }
    const result = target.call(this, ...args);
    cache.set(cacheKey, result);
    return result;
  };
}
