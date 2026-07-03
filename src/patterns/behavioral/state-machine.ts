/**
 * Máquina de estados mínima (patrón State). Las clases que quieran usar
 * `@When` y `@TransitionTo` deben extenderla (mismo modelo que `Subject`
 * en el patrón Observer).
 */
export class StateMachine<State extends string = string> {
  #state: State;

  constructor(initialState: State) {
    this.#state = initialState;
  }

  /** Estado actual. */
  get state(): State {
    return this.#state;
  }

  /** Cambia el estado. Normalmente lo hace @TransitionTo. */
  transitionTo(next: State): void {
    this.#state = next;
  }
}

/**
 * Guarda de estado: el método solo puede llamarse cuando la máquina está
 * en alguno de los estados permitidos; en otro caso lanza `Error` y el
 * método no se ejecuta. Colócalo como decorador MÁS EXTERNO (encima de
 * @TransitionTo) para que la guarda se evalúe primero.
 *
 * @example
 * ```ts
 * class Doc extends StateMachine<'draft' | 'review'> {
 *   @When('draft')
 *   @TransitionTo('review')
 *   submit(): void { ... }
 * }
 * ```
 */
export function When(...allowed: string[]) {
  return function <This extends StateMachine<string>, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@When solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      if (!allowed.includes(this.state)) {
        throw new Error(
          `El método ${methodName} no puede llamarse en el estado "${this.state}" (permitidos: ${allowed.join(', ')})`,
        );
      }
      return target.call(this, ...args);
    };
  };
}

/**
 * Tras ejecutar el método con éxito, transiciona la máquina al estado
 * indicado. Si el método lanza, el estado no cambia.
 *
 * @example ver @When
 */
export function TransitionTo(next: string) {
  return function <This extends StateMachine<string>, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@TransitionTo solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const result = target.call(this, ...args);
      this.transitionTo(next);
      return result;
    };
  };
}
