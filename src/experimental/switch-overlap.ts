import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import type { Operator } from '../core/operator';
import type { AnyMethod, MaybePromise } from '../core/types';
import type { OverlapKeyContext } from '../operators/overlap-types';

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

export type SwitchOverlapKeyContext<This, Args extends readonly unknown[]> = OverlapKeyContext<
  This,
  Args
>;

export interface SwitchOverlapOptions<This, Args extends readonly unknown[]> {
  /** Resolves the partition in which a newer call supersedes an older one. */
  readonly key: (context: SwitchOverlapKeyContext<This, Args>) => PropertyKey;
}

/**
 * Error lanzado cuando una invocación es superada por una llamada más reciente
 * en el mismo solapamiento (experimental).
 */
export class OverlapSupersededError extends PolicyError {
  readonly key: PropertyKey;

  constructor(
    key: PropertyKey,
    message = 'An overlapping invocation was superseded by a newer call',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'OVERLAP_SUPERSEDED' });
    this.name = 'OverlapSupersededError';
    this.key = key;
  }
}

interface ActiveInvocation {
  superseded: OverlapSupersededError | undefined;
  reject: ((reason?: unknown) => void) | undefined;
}

function isPromiseLike<Result>(value: MaybePromise<Result>): value is PromiseLike<Result> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<Result>).then === 'function'
    );
  } catch {
    return true;
  }
}

function createKeyContext<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
): SwitchOverlapKeyContext<This, Args> {
  if (context !== undefined) {
    return context;
  }

  return Object.freeze({
    receiver,
    args: Object.freeze([...args]) as unknown as Args,
    key: undefined,
    operationId: undefined,
    metadata: emptyMetadata,
    signal: undefined,
  });
}

function resolveKey<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
  options: SwitchOverlapOptions<This, Args>,
): PropertyKey {
  return context?.key ?? options.key(createKeyContext(receiver, args, context));
}

function assertOptions<This, Args extends readonly unknown[]>(
  options: SwitchOverlapOptions<This, Args>,
): void {
  if (typeof options.key !== 'function') {
    throw new TypeError('switchOverlap requires a key resolver');
  }
}

/**
 * Experimental operador de solapamiento "gana-el-último": cuando llega una llamada
 * nueva en la misma clave, rechaza inmediatamente la anterior con
 * `OverlapSupersededError`. El trabajo anterior sigue ejecutándose (no puede cancelarse
 * en JavaScript puro). ADVERTENCIA: es experimental y puede cambiar.
 *
 * @param options configuración con `key` para particionar estado.
 * @returns operador que aplica la estrategia experimental de gana-el-último.
 */
export function switchOverlap<This, Args extends readonly unknown[], Result>(
  options: SwitchOverlapOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  assertOptions(options);

  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const active = new Map<PropertyKey, ActiveInvocation>();

    return function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): MaybePromise<Result> {
      const key = resolveKey(this, args, context, options);
      const previous = active.get(key);
      if (previous !== undefined) {
        const superseded = new OverlapSupersededError(key);
        previous.superseded = superseded;
        previous.reject?.(superseded);
        if (active.get(key) === previous) {
          active.delete(key);
        }
      }

      const entry: ActiveInvocation = {
        superseded: undefined,
        reject: undefined,
      };
      active.set(key, entry);
      emitPolicyEvent(context, 'switchOverlap', 'overlap.started', { key });

      let result: MaybePromise<Result>;
      try {
        result = next.call(this, context, ...args);
      } catch (error) {
        if (active.get(key) === entry) {
          active.delete(key);
        }
        emitPolicyEvent(context, 'switchOverlap', 'overlap.completed', { key });
        if (entry.superseded !== undefined) {
          return Promise.reject(entry.superseded);
        }
        throw error;
      }

      if (!isPromiseLike(result)) {
        if (active.get(key) === entry) {
          active.delete(key);
        }
        emitPolicyEvent(context, 'switchOverlap', 'overlap.completed', { key });
        return entry.superseded === undefined ? result : Promise.reject(entry.superseded);
      }

      return new Promise<Result>((resolve, reject) => {
        entry.reject = reject;
        if (entry.superseded !== undefined) {
          reject(entry.superseded);
        }

        void Promise.resolve(result).then(
          (value) => {
            if (active.get(key) === entry) {
              active.delete(key);
            }
            emitPolicyEvent(context, 'switchOverlap', 'overlap.completed', { key });
            if (entry.superseded === undefined) {
              resolve(value);
            }
          },
          (error: unknown) => {
            if (active.get(key) === entry) {
              active.delete(key);
            }
            emitPolicyEvent(context, 'switchOverlap', 'overlap.completed', { key });
            if (entry.superseded === undefined) {
              reject(error);
            }
          },
        );
      });
    };
  };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'switchOverlap',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createWrapper(function (this: This, _context, ...args: Args): MaybePromise<Result> {
          return next.call(this, ...args);
        }),
      );
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createWrapper(next);
    },
  };

  return operator;
}
