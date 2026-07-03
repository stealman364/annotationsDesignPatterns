export interface CircuitBreakerOptions {
  /** Fallos consecutivos que abren el circuito. Mínimo 1. */
  failures: number;
  /** Milisegundos que el circuito permanece abierto antes de permitir otro intento. */
  resetMs: number;
}

interface BreakerState {
  consecutiveFailures: number;
  openedAt: number | undefined;
}

/**
 * Circuit breaker para métodos asíncronos: tras `failures` fallos
 * consecutivos, el circuito se abre y las llamadas fallan inmediatamente
 * (sin ejecutar el método) durante `resetMs` ms. Pasado ese tiempo, se
 * permite un intento (semiabierto): si tiene éxito el circuito se cierra;
 * si falla, vuelve a abrirse. El estado es por instancia.
 *
 * @example
 * ```ts
 * class Api {
 *   @CircuitBreaker({ failures: 3, resetMs: 30_000 })
 *   async fetchData(): Promise<Data> { ... }
 * }
 * ```
 */
export function CircuitBreaker({ failures, resetMs }: CircuitBreakerOptions) {
  if (failures < 1) {
    throw new RangeError('@CircuitBreaker requiere al menos 1 fallo para abrir el circuito');
  }
  if (resetMs <= 0) {
    throw new RangeError('@CircuitBreaker requiere un resetMs mayor que 0');
  }
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Promise<Return>,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Return>>,
  ): (this: This, ...args: Args) => Promise<Return> {
    if (context.kind !== 'method') {
      throw new TypeError('@CircuitBreaker solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    const states = new WeakMap<object, BreakerState>();
    return async function (this: This, ...args: Args): Promise<Return> {
      const self = this as object;
      let state = states.get(self);
      if (!state) {
        state = { consecutiveFailures: 0, openedAt: undefined };
        states.set(self, state);
      }
      if (state.openedAt !== undefined) {
        if (Date.now() - state.openedAt < resetMs) {
          throw new Error(`Circuito abierto para ${methodName}: demasiados fallos consecutivos`);
        }
        state.openedAt = undefined; // semiabierto: se permite un intento
      }
      try {
        const result = await target.call(this, ...args);
        state.consecutiveFailures = 0;
        return result;
      } catch (error) {
        state.consecutiveFailures++;
        if (state.consecutiveFailures >= failures) {
          state.openedAt = Date.now();
        }
        throw error;
      }
    };
  };
}
