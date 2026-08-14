import { normalizeRetryOptions, retry, type RetryOptions } from '../../operators/retry';
import { adaptOperator } from '../../decorators/adapters';

export type { RetryOptions } from '../../operators/retry';

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
export function Retry(options: RetryOptions) {
  // Las expresiones de decorador se evalúan antes de aplicar el decorador.
  // Conservamos una copia ya validada para que una mutación posterior del
  // objeto del consumidor no cambie el pipeline que se va a instalar.
  const normalizedOptions = normalizeRetryOptions(options);
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    return adaptOperator<This, Args, Return>(() => retry<This, Args, Return>(normalizedOptions), {
      decoratorName: '@Retry',
    })(target, context);
  };
}
