/** Tipo de una instancia iterable: la original más el protocolo Iterable. */
export type WithIterator<T, Item> = T & Iterable<Item>;

/**
 * Patrón Iterator: hace la clase iterable (`for...of`, spread,
 * `Array.from`) delegando en la propiedad iterable indicada (normalmente
 * un array interno).
 *
 * `Symbol.iterator` existe en runtime; para que el sistema de tipos lo
 * vea, castea con `WithIterator<Clase, Elemento>` (los decoradores TC39 no
 * pueden ampliar el tipo de la clase, igual que ocurre con @Adapt).
 *
 * @example
 * ```ts
 * @IterableOver('items')
 * class Playlist {
 *   items: Song[] = [];
 * }
 * for (const song of playlist as WithIterator<Playlist, Song>) { ... }
 * ```
 */
export function IterableOver(property: string) {
  return function <T extends new (...args: any[]) => object>(
    target: T,
    context: ClassDecoratorContext<T>,
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@IterableOver solo puede aplicarse a una clase');
    }
    Object.defineProperty(target.prototype, Symbol.iterator, {
      value: function (this: Record<string, unknown>): Iterator<unknown> {
        const source = this[property] as
          | { [Symbol.iterator]?: () => Iterator<unknown> }
          | null
          | undefined;
        const iteratorFn = source?.[Symbol.iterator];
        if (typeof iteratorFn !== 'function') {
          throw new TypeError(
            `La propiedad "${property}" no es iterable; @IterableOver necesita un array u otro iterable`,
          );
        }
        return iteratorFn.call(source);
      },
      writable: true,
      configurable: true,
    });
    return target;
  };
}
