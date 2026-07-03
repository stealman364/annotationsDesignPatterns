/**
 * Historial de estados (patrón Memento). Guarda copias superficiales de las
 * propiedades propias y enumerables de la instancia y permite restaurarlas
 * en orden LIFO.
 */
export class SnapshotHistory {
  #mementos: Array<{ instance: object; state: Record<string, unknown> }> = [];

  /** Guarda una copia superficial del estado actual. Normalmente lo llama @Snapshot. */
  save(instance: object): void {
    this.#mementos.push({ instance, state: { ...(instance as Record<string, unknown>) } });
  }

  /** Restaura el último estado guardado sobre su instancia. Lanza si está vacío. */
  restoreLast(): void {
    const memento = this.#mementos.pop();
    if (!memento) {
      throw new Error('No hay snapshots que restaurar');
    }
    Object.assign(memento.instance, memento.state);
  }

  get size(): number {
    return this.#mementos.length;
  }
}

/**
 * Antes de ejecutar el método, guarda en el historial una copia superficial
 * del estado de la instancia (patrón Memento). `history.restoreLast()`
 * revierte la última mutación. Limitación: la restauración reasigna las
 * propiedades guardadas pero no elimina propiedades añadidas después.
 *
 * @example
 * ```ts
 * const history = new SnapshotHistory();
 * class Editor {
 *   @Snapshot(history)
 *   write(text: string): void { this.content += text; }
 * }
 * history.restoreLast(); // deshace el último write
 * ```
 */
export function Snapshot(history: SnapshotHistory) {
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Snapshot solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      history.save(this);
      return target.call(this, ...args);
    };
  };
}
