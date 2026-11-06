/**
 * Interfaz de un comando reversible (patrón Command).
 * La ejecución se realiza en `execute` y la reversión en `undo`.
 */
export interface Command {
  execute(): void;
  undo(): void;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<unknown>).then === 'function'
    );
  } catch {
    return true;
  }
}

/** Historial de comandos ejecutados, con deshacer en orden LIFO (patrón Command). */
export class CommandHistory {
  #done: Array<{ readonly command: Command; undoing: boolean }> = [];

  /** Apunta un comando ya ejecutado. Normalmente lo llama @Revertible. */
  push(command: Command): void {
    this.#done.push({ command, undoing: false });
  }

  /** Deshace el último comando de forma síncrona. Si undo lanza, conserva el comando. */
  undoLast(): void {
    let index = this.#done.length - 1;
    while (this.#done[index]?.undoing === true) index -= 1;
    const entry = this.#done[index];
    if (entry === undefined) {
      throw new Error('No hay comandos que deshacer');
    }
    entry.undoing = true;
    try {
      entry.command.undo();
    } catch (error) {
      entry.undoing = false;
      throw error;
    }
    // A nested undo can remove earlier entries or append new commands. Remove
    // this exact entry, even when the same Command object was pushed twice.
    this.#done.splice(this.#done.indexOf(entry), 1);
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
 * Las operaciones async se registran al resolverse, en orden de finalización;
 * si rechazan, no se registran. El método de deshacer debe ser síncrono.
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
      const command: Command = {
        execute: () => {
          target.call(this, ...args);
        },
        undo: () => {
          (undoFn as (this: This, ...a: Args) => unknown).call(this, ...args);
        },
      };
      if (isPromiseLike(result)) {
        return Promise.resolve(result).then((value) => {
          history.push(command);
          return value;
        }) as Return;
      }
      history.push(command);
      return result;
    };
  };
}
