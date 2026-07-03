/**
 * Tipo de una instancia adaptada: la original más un alias por cada entrada
 * del mapeo, con la firma del método original.
 */
export type Adapted<T, M extends Record<string, keyof T>> = T & {
  [K in keyof M]: T[M[K]];
};

/**
 * Patrón Adapter: expone métodos existentes de la clase bajo nombres nuevos
 * (alias), para cumplir la interfaz que espera otro código sin reescribir
 * la clase. El mapeo es `{ aliasNuevo: 'metodoExistente' }`.
 *
 * Los alias existen en runtime; para que el sistema de tipos los vea,
 * castea la instancia con el tipo `Adapted<Clase, Mapeo>` (los decoradores
 * TC39 no pueden ampliar el tipo de la clase).
 *
 * @example
 * ```ts
 * @Adapt({ send: 'postMessage' })
 * class LegacySocket {
 *   postMessage(data: string): void { ... }
 * }
 * const s = new LegacySocket() as Adapted<LegacySocket, { send: 'postMessage' }>;
 * s.send('hola');
 * ```
 */
export function Adapt(aliases: Record<string, string>) {
  return function <T extends new (...args: any[]) => object>(
    target: T,
    context: ClassDecoratorContext<T>,
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@Adapt solo puede aplicarse a una clase');
    }
    const prototype = target.prototype as Record<string, unknown>;
    for (const [alias, existing] of Object.entries(aliases)) {
      const method = prototype[existing];
      if (typeof method !== 'function') {
        throw new TypeError(
          `No existe el método "${existing}" en la clase para adaptarlo como "${alias}"`,
        );
      }
      Object.defineProperty(target.prototype, alias, {
        value: method,
        writable: true,
        configurable: true,
      });
    }
    return target;
  };
}
