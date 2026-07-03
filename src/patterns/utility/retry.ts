export interface RetryOptions {
  /** Número total de intentos (incluido el primero). Mínimo 1. */
  attempts: number;
  /** Espera antes del primer reintento en milisegundos. Por defecto 0 (sin espera). */
  delayMs?: number;
  /**
   * Multiplicador de la espera entre reintentos (backoff exponencial):
   * la espera n vale `delayMs * backoffFactor^(n-1)`. Por defecto 1
   * (espera fija, comportamiento original). Mínimo 1.
   */
  backoffFactor?: number;
}

/**
 * Reintenta un método asíncrono cuando lanza o rechaza, hasta agotar los
 * intentos. Si todos fallan, propaga el último error. Con `backoffFactor`
 * la espera crece exponencialmente entre reintentos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Retry({ attempts: 4, delayMs: 200, backoffFactor: 2 }) // 200, 400, 800 ms
 *   async fetchUser(id: string): Promise<User> { ... }
 * }
 * ```
 */
export function Retry({ attempts, delayMs = 0, backoffFactor = 1 }: RetryOptions) {
  if (attempts < 1) {
    throw new RangeError('@Retry requiere al menos 1 intento');
  }
  if (backoffFactor < 1) {
    throw new RangeError('@Retry requiere un backoffFactor mayor o igual que 1');
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
            const wait = delayMs * backoffFactor ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, wait));
          }
        }
      }
      throw lastError;
    };
  };
}
