export interface LogOptions {
  /** Destino de los mensajes. Por defecto `console.log`. */
  logger?: (message: string) => void;
  /** Etiqueta del método en los mensajes. Por defecto su nombre. */
  label?: string;
}

function formatArg(arg: unknown): string {
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Registra cada llamada al método: entrada con argumentos, y salida con
 * éxito (✓) o error (✗) y duración en ms. Si el método devuelve una
 * Promise, el mensaje de salida se emite al resolver o rechazar. Los
 * errores se propagan intactos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Log() // console.log por defecto
 *   fetchUser(id: string): User { ... }
 *
 *   @Log({ logger: (m) => miLogger.info(m), label: 'Api.criticalPath' })
 *   critical(): void { ... }
 * }
 * ```
 */
export function Log({ logger = console.log, label }: LogOptions = {}) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Log solo puede aplicarse a un método');
    }
    const name = label ?? String(context.name);
    return function (this: This, ...args: Args): Return {
      logger(`→ ${name}(${args.map(formatArg).join(', ')})`);
      const start = Date.now();
      try {
        const result = target.call(this, ...args);
        if (result instanceof Promise) {
          return result.then(
            (value: unknown) => {
              logger(`← ${name} ✓ ${Date.now() - start} ms`);
              return value;
            },
            (error: unknown) => {
              logger(`← ${name} ✗ ${Date.now() - start} ms: ${String(error)}`);
              throw error;
            },
          ) as Return;
        }
        logger(`← ${name} ✓ ${Date.now() - start} ms`);
        return result;
      } catch (error) {
        logger(`← ${name} ✗ ${Date.now() - start} ms: ${String(error)}`);
        throw error;
      }
    };
  };
}
