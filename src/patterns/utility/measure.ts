/** Métrica de una ejecución del método medido. */
export interface MeasureReport {
  method: string;
  durationMs: number;
  ok: boolean;
}

/**
 * Mide la duración de cada ejecución del método y la entrega al callback
 * (para métricas, histogramas, APM…). Si el método devuelve una Promise,
 * mide hasta que resuelve o rechaza. Los errores se propagan intactos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Measure((r) => metrics.histogram('api.fetch', r.durationMs, { ok: r.ok }))
 *   async fetch(id: string): Promise<Data> { ... }
 * }
 * ```
 */
export function Measure(onMeasure: (report: MeasureReport) => void) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Measure solo puede aplicarse a un método');
    }
    const method = String(context.name);
    return function (this: This, ...args: Args): Return {
      const start = Date.now();
      const report = (ok: boolean): void => {
        onMeasure({ method, durationMs: Date.now() - start, ok });
      };
      try {
        const result = target.call(this, ...args);
        if (result instanceof Promise) {
          return result.then(
            (value: unknown) => {
              report(true);
              return value;
            },
            (error: unknown) => {
              report(false);
              throw error;
            },
          ) as Return;
        }
        report(true);
        return result;
      } catch (error) {
        report(false);
        throw error;
      }
    };
  };
}
