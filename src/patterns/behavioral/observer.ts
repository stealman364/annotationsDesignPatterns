export type Listener = (payload: unknown) => void;

/**
 * Sujeto observable mínimo (patrón Observer). Las clases que quieran usar
 * `@Emits` deben extender `Subject`.
 */
export class Subject {
  #listeners = new Map<string, Set<Listener>>();

  /** Suscribe un listener al evento. Devuelve la función para desuscribirse. */
  on(event: string, listener: Listener): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set<Listener>();
      this.#listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  /** Notifica a todos los listeners del evento. */
  emit(event: string, payload: unknown): void {
    this.#listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

/**
 * Tras ejecutar el método con éxito, emite `event` en el propio objeto
 * (que debe extender `Subject`) con el valor de retorno como payload.
 * Si el método lanza, no se emite nada.
 *
 * @example
 * ```ts
 * class UserService extends Subject {
 *   @Emits('user:created')
 *   create(name: string): User { ... }
 * }
 * ```
 */
export function Emits(event: string) {
  return function <This extends Subject, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Emits solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const result = target.call(this, ...args);
      this.emit(event, result);
      return result;
    };
  };
}
