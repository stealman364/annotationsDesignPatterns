/** Eslabón de la cadena: decide si puede procesar la petición y la procesa. */
export interface Handler<Request, Result> {
  canHandle(request: Request): boolean;
  handle(request: Request): Result;
}

/**
 * Cadena de responsabilidad: recorre los handlers en orden de prioridad
 * (menor número = antes) y delega en el primero cuyo `canHandle` acepte.
 */
export class HandlerChain<Request, Result> {
  #entries: Array<{ priority: number; handler: Handler<Request, Result> }> = [];

  register(handler: Handler<Request, Result>, priority = 0): void {
    this.#entries.push({ priority, handler });
    this.#entries.sort((a, b) => a.priority - b.priority);
  }

  dispatch(request: Request): Result {
    for (const { handler } of this.#entries) {
      if (handler.canHandle(request)) {
        return handler.handle(request);
      }
    }
    throw new Error('Ningún handler de la cadena pudo procesar la petición');
  }
}

/**
 * Registra una instancia de la clase decorada (constructor sin argumentos)
 * como eslabón de la cadena, con la prioridad indicada (menor = antes).
 *
 * @example
 * ```ts
 * const chain = new HandlerChain<Request, Response>();
 *
 * @HandlerFor(chain, 1)
 * class AuthHandler implements Handler<Request, Response> { ... }
 *
 * chain.dispatch(request);
 * ```
 */
export function HandlerFor<Request, Result>(chain: HandlerChain<Request, Result>, priority = 0) {
  return function <T extends new () => Handler<Request, Result>>(
    target: T,
    context: ClassDecoratorContext<T>
  ): T {
    if (context.kind !== 'class') {
      throw new TypeError('@HandlerFor solo puede aplicarse a una clase');
    }
    chain.register(new target(), priority);
    return target;
  };
}
