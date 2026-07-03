export interface Command {
  execute(): void;
  undo(): void;
}

/** Historial de comandos ejecutados, con deshacer en orden LIFO (patrón Command). */
export class CommandHistory {
  #done: Command[] = [];

  /** Apunta un comando ya ejecutado. Normalmente lo llama @Revertible. */
  push(command: Command): void {
    this.#done.push(command);
  }

  /** Deshace el último comando. Lanza si el historial está vacío. */
  undoLast(): void {
    const command = this.#done.pop();
    if (!command) {
      throw new Error('No hay comandos que deshacer');
    }
    command.undo();
  }

  get size(): number {
    return this.#done.length;
  }
}

/**
 * Convierte cada llamada al método en un comando desechable: se ejecuta
 * normalmente y se apunta en el historial junto con su inversa
 * (`undoMethod`, otro método de la misma clase que recibe los MISMOS
 * argumentos y revierte el efecto).
 *
 * @example
 * ```ts
 * const history = new CommandHistory();
 * class Counter {
 *   @Revertible(history, 'decrement')
 *   increment(n: number): void { this.value += n; }
 *   decrement(n: number): void { this.value -= n; }
 * }
 * history.undoLast(); // revierte el último increment
 * ```
 */
export function Revertible(history: CommandHistory, undoMethod: string) {
  return function <This extends object, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Revertible solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const undoFn = (this as Record<string, unknown>)[undoMethod];
      if (typeof undoFn !== 'function') {
        throw new TypeError(
          `El método de deshacer "${undoMethod}" no existe en la clase decorada con @Revertible`,
        );
      }
      const result = target.call(this, ...args);
      history.push({
        execute: () => {
          target.call(this, ...args);
        },
        undo: () => {
          (undoFn as (this: This, ...a: Args) => unknown).call(this, ...args);
        },
      });
      return result;
    };
  };
}
