export interface RetryOptions {
  /** Número total de intentos (incluido el primero). Mínimo 1. */
  attempts: number;
  /** Espera entre intentos en milisegundos. Por defecto 0 (sin espera). */
  delayMs?: number;
}

/**
 * Reintenta un método asíncrono cuando lanza o rechaza, hasta agotar los
 * intentos. Si todos fallan, propaga el último error.
 *
 * @example
 * ```ts
 * class Api {
 *   @Retry({ attempts: 3, delayMs: 200 })
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Retry({ attempts, delayMs = 0 }: RetryOptions) {
  if (attempts < 1) {
    throw new RangeError('@Retry requiere al menos 1 intento');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@Retry solo puede aplicarse a un método');
    }
    return async function (this: This, ...args: Args): Promise<Return> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          return await target.call(this, ...args);
        } catch (error) {
          lastError = error;
          if (attempt < attempts && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }
      throw lastError;
    };
  };
}
