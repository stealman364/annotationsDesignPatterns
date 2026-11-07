/**
 * Máquina de estados mínima (patrón State). Las clases que quieran usar
 * `@When` y `@TransitionTo` deben extenderla (mismo modelo que `Subject`
 * en el patrón Observer).
 */
type TransitionRecord = {
  readonly capture: () => object;
  readonly commit: (next: string, expected: object) => void;
};

// Independently bundled root/granular ESM/CJS entrypoints share an immutable
// companion on the instance, without a global instance registry or public API.
const transitionRecordKey = Symbol.for('annotations-design-patterns.state-transition-record');
const stateTransitionConflictBrand = Symbol.for(
  'annotations-design-patterns.StateTransitionConflictError',
);

/** Thrown when an optimistic transition finishes after another transition committed first. */
export class StateTransitionConflictError extends Error {
  constructor() {
    super('The state changed before the optimistic transition could commit');
    this.name = 'StateTransitionConflictError';
    Object.defineProperty(this, stateTransitionConflictBrand, { value: true });
  }
}

/** Recognizes optimistic transition conflicts, including errors from another package copy. */
export function isStateTransitionConflictError(
  error: unknown,
): error is StateTransitionConflictError {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return false;
  try {
    return (error as Record<PropertyKey, unknown>)[stateTransitionConflictBrand] === true;
  } catch {
    return false;
  }
}

function getTransitionRecord(machine: object): TransitionRecord {
  const record = (machine as { readonly [transitionRecordKey]?: TransitionRecord })[
    transitionRecordKey
  ];
  if (!record) throw new TypeError('@TransitionTo requires a StateMachine instance');
  return record;
}

export class StateMachine<State extends string = string> {
  #state: State;
  #revision: object = {};

  constructor(initialState: State) {
    this.#state = initialState;
    const record: TransitionRecord = Object.freeze({
      capture: () => this.#revision,
      commit: (next: string, expected: object) => {
        if (this.#revision !== expected) throw new StateTransitionConflictError();
        this.#state = next as State;
        this.#revision = {};
      },
    });
    Object.defineProperty(this, transitionRecordKey, { value: record });
  }

  /** Estado actual. */
  get state(): State {
    return this.#state;
  }

  /** Cambia el estado. Normalmente lo hace @TransitionTo. */
  transitionTo(next: State): void {
    this.#revision = {};
    this.#state = next;
  }
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

type ValidStates<Selected extends string, State extends string> = [
  Exclude<Selected, State>,
] extends [never]
  ? unknown
  : never;

/**
 * Guarda de estado: el método solo puede llamarse cuando la máquina está
 * en alguno de los estados permitidos; en otro caso lanza `Error` y el
 * método no se ejecuta. Colócalo como decorador MÁS EXTERNO (encima de
 * `@TransitionTo`) para que la guarda se evalúe primero.
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
export function When<const Allowed extends readonly string[]>(
  ...allowed: Allowed
): <This extends StateMachine<string>, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return> &
    ValidStates<Allowed[number], This['state']>,
) => (this: This, ...args: Args) => Return;
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

/** Enables first-valid-commit concurrency for asynchronous methods. */
export type TransitionToOptions = {
  concurrency: 'reject-stale';
};

/**
 * After the method succeeds, transitions the machine to `next`. With no options,
 * completion continues to call `transitionTo` virtually for compatibility. The
 * `reject-stale` mode commits only when no base transition occurred since the
 * method started; a conflict does not undo the method's side effects.
 */
export function TransitionTo<const Next extends string>(
  next: Next,
  options?: TransitionToOptions,
): <This extends StateMachine<string>, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return> &
    ValidStates<Next, This['state']>,
) => (this: This, ...args: Args) => Return;
export function TransitionTo(next: string, options?: TransitionToOptions) {
  if (
    options !== undefined &&
    (typeof options !== 'object' || options === null || options.concurrency !== 'reject-stale')
  ) {
    throw new TypeError('Unsupported @TransitionTo concurrency option');
  }
  const rejectStale = options?.concurrency === 'reject-stale';
  return function <This extends StateMachine<string>, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@TransitionTo solo puede aplicarse a un método');
    }
    return function (this: This, ...args: Args): Return {
      const record = rejectStale ? getTransitionRecord(this) : undefined;
      const revision = record?.capture();
      const result = target.call(this, ...args);
      const commit = () => {
        if (!record) {
          this.transitionTo(next);
          return;
        }
        record.commit(next, revision!);
      };
      if (
        record &&
        result !== null &&
        (typeof result === 'object' || typeof result === 'function')
      ) {
        let then: unknown;
        try {
          then = (result as { readonly then?: unknown }).then;
        } catch (error) {
          return Promise.reject(error) as Return;
        }
        if (typeof then === 'function') {
          return new Promise<unknown>((resolve, reject) => {
            queueMicrotask(() => {
              try {
                Reflect.apply(then, result, [resolve, reject]);
              } catch (error) {
                reject(error);
              }
            });
          }).then((value) => {
            commit();
            return value;
          }) as Return;
        }
        commit();
        return result;
      }
      if (isPromiseLike(result)) {
        return Promise.resolve(result).then((value) => {
          commit();
          return value;
        }) as Return;
      }
      commit();
      return result;
    };
  };
}
