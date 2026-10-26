import type { AnyMethod, Operator } from './types';
import { composeOperators } from '../operators/compose';

/**
 * Compone operadores sobre un método, devolviendo una función envolvente que
 * aplica cada operador en orden.
 *
 * @param method función base a envolver.
 * @param operators una o más políticas/operadores, aplicados de derecha a izquierda.
 * @returns método envuelto con todos los operadores aplicados.
 *
 * @example
 * ```ts
 * const fetchWithRetry = pipe(
 *   async (id: string) => fetch(`/api/user/${id}`),
 *   retry({ attempts: 3, delayMs: 100 }),
 *   timeout(5000),
 *   circuitBreaker({ failures: 5, resetMs: 30_000 }),
 * );
 * const user = await fetchWithRetry('123');
 * ```
 */
export function pipe<This, Args extends readonly unknown[], Result>(
  method: AnyMethod<This, Args, Result>,
  ...operators: ReadonlyArray<Operator<This, Args, Result, Result>>
): AnyMethod<This, Args, Result> {
  return composeOperators(method, ...operators);
}
