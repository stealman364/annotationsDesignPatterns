/**
 * Selector de estrategias intercambiables en runtime (patrón Strategy).
 * Las estrategias se registran con `register` o con el decorador `@StrategyFor`.
 */
export class StrategySelector<S extends object> {
  #strategies = new Map<string, S>();
  #active: string | undefined;

  register(key: string, strategy: S): void {
    if (this.#strategies.has(key)) {
      throw new Error(`La estrategia "${key}" ya está registrada`);
    }
    this.#strategies.set(key, strategy);
  }

  /** Activa la estrategia registrada bajo `key`. */
  use(key: string): void {
    if (!this.#strategies.has(key)) {
      throw new Error(
        `Estrategia "${key}" no registrada. Disponibles: ${this.keys().join(', ') || '(ninguna)'}`
      );
    }
    this.#active = key;
  }

  /** La estrategia activa. Lanza si no se ha llamado antes a use(). */
  get current(): S {
    if (this.#active === undefined) {
      throw new Error('No hay estrategia activa: llama antes a use(clave)');
    }
    return this.#strategies.get(this.#active) as S;
  }

  keys(): string[] {
    return [...this.#strategies.keys()];
  }
}

/**
 * Registra una instancia de la clase decorada (constructor sin argumentos)
 * como estrategia en el selector bajo la clave indicada.
 *
 * @example
 * ```ts
 * const compression = new StrategySelector<Compression>();
 *
 * @StrategyFor(compression, 'zip')
 * class Zip implements Compression { ... }
 *
 * compression.use('zip');
 * compression.current.compress(data);
 * ```
 */
export function StrategyFor<S extends object>(selector: StrategySelector<S>, key: string) {
  return function <T extends new () => S>(target: T, context: ClassDecoratorContext<T>): T {
    if (context.kind !== 'class') {
      throw new TypeError('@StrategyFor solo puede aplicarse a una clase');
    }
    selector.register(key, new target());
    return target;
  };
}
