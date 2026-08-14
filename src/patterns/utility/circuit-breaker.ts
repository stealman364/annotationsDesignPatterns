import {
  CircuitBreakerOpenError,
  circuitBreaker,
  normalizeCircuitBreakerOptions,
  type CircuitBreakerOptions,
} from '../../operators/circuit-breaker';
import { adaptOperator } from '../../decorators/adapters';

export type { CircuitBreakerOptions } from '../../operators/circuit-breaker';

/**
 * Circuit breaker local para métodos asíncronos: tras `failures` fallos
 * consecutivos, el circuito se abre durante `resetMs` ms. El estado queda
 * aislado por instancia; no se distribuye entre procesos ni nodos.
 *
 * @example
 * ```ts
 * class Api {
 *   @CircuitBreaker({ failures: 3, resetMs: 30_000 })
 *   async fetchData(): Promise<Data> { ... }
 * }
 * ```
 */
export function CircuitBreaker(options: CircuitBreakerOptions) {
  // Una factoría de decorador y su aplicación ocurren en pasos distintos.
  // Copiamos los valores validados ahora para evitar observar mutaciones del
  // objeto de opciones entre ambos pasos.
  const normalizedOptions = normalizeCircuitBreakerOptions(options);
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    return adaptOperator<This, Args, Return>(
      (operatorContext) => {
        const methodName = String(operatorContext.name);
        return circuitBreaker<This, Args, Return>(
          normalizedOptions,
          () =>
            new CircuitBreakerOpenError(
              `Circuito abierto para ${methodName}: demasiados fallos consecutivos`,
            ),
        );
      },
      { decoratorName: '@CircuitBreaker', scope: 'instance' },
    )(target, context);
  };
}
