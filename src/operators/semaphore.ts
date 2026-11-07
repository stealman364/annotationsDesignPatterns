import { raceWithSignal } from '../core/cancellation';
import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { emitPolicyEvent } from '../core/context';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import { PolicyError, type PolicyErrorOptions } from '../core/errors';
import { isCount } from '../core/numeric';
import type { Operator } from '../core/operator';
import { PermitQueue, type Release } from '../core/permit-queue';
import type { AnyMethod } from '../core/types';
import type { OverlapKeyContext } from './overlap-types';

export type SemaphoreKeyContext<This, Args extends readonly unknown[]> = OverlapKeyContext<
  This,
  Args
>;

export interface SemaphoreOptions<This, Args extends readonly unknown[]> {
  readonly permits: number;
  /** Optional partition resolver. An invocation's explicit key takes precedence. */
  readonly key?: (context: SemaphoreKeyContext<This, Args>) => PropertyKey;
  /** Waiting calls per partition; active holders do not count. Omitted is unbounded. */
  readonly maxQueue?: number;
}

export class SemaphoreQueueFullError extends PolicyError {
  readonly key?: PropertyKey;

  constructor(
    key?: PropertyKey,
    message = 'The semaphore queue is full',
    options: Omit<PolicyErrorOptions, 'code'> = {},
  ) {
    super(message, { ...options, code: 'POLICY_ERROR' });
    this.name = 'SemaphoreQueueFullError';
    this.key = key;
  }
}

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Limits active executions per optional key, with FIFO admission and no barging.
 * One applied pipeline shares its pools across receivers. Caller cancellation
 * withdraws queued work and stops waiting for active work; its permit remains
 * held until the underlying invocation actually settles.
 */
function createSemaphoreOperator<This, Args extends readonly unknown[], Result>(
  options: SemaphoreOptions<This, Args>,
  poolsForApply: () => Map<PropertyKey | undefined, PermitQueue> = () => new Map(),
): Operator<This, Args, Result, Result> {
  const { permits, key: resolveKey, maxQueue } = options;
  if (!isCount(permits, 1))
    throw new RangeError('semaphore requires at least one safe integer permit');
  if (maxQueue !== undefined && !isCount(maxQueue, 0)) {
    throw new RangeError('semaphore requires maxQueue to be a non-negative safe integer');
  }
  if (resolveKey !== undefined && typeof resolveKey !== 'function') {
    throw new TypeError('semaphore requires key to be a resolver');
  }

  const createWrapper = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> => {
    const pools = poolsForApply();
    return function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): Promise<Result> {
      const signal = context?.signal;
      if (signal?.aborted === true) return Promise.reject(signal.reason);
      try {
        const key =
          context?.key ??
          resolveKey?.(
            context ??
              Object.freeze({
                receiver: this,
                args: Object.freeze([...args]) as unknown as Args,
                operationId: undefined,
                metadata: emptyMetadata,
                key: undefined,
                signal: undefined,
              }),
          );
        const pool = pools.get(key) ?? new PermitQueue(permits, maxQueue);
        pools.set(key, pool);
        const cleanup = (): void => {
          if (pool.isIdle && pools.get(key) === pool) pools.delete(key);
        };
        const execute = (release: Release): Promise<Result> => {
          if (signal?.aborted === true) {
            release();
            cleanup();
            return Promise.reject(signal.reason);
          }
          const complete = (): void => {
            // Observers run while ownership is still held, so reentrant callers
            // join the existing FIFO rather than overtaking a queued waiter.
            emitPolicyEvent(context, 'semaphore', 'semaphore.released', {});
            release();
            cleanup();
          };
          emitPolicyEvent(context, 'semaphore', 'semaphore.acquired', {});
          try {
            // An acquired observer may have cancelled this caller synchronously.
            if (signal?.aborted) throw signal.reason;
            const result = Promise.resolve(next.call(this, context, ...args));
            return raceWithSignal(result.finally(complete), signal) as Promise<Result>;
          } catch (error) {
            complete();
            return Promise.reject(signal?.aborted ? signal.reason : error);
          }
        };
        const acquired = pool.acquire(signal, () => {
          emitPolicyEvent(context, 'semaphore', 'semaphore.queued', {});
        });
        if (acquired === undefined) return Promise.reject(new SemaphoreQueueFullError(key));
        return typeof acquired === 'function'
          ? execute(acquired)
          : acquired.then(execute, (error: unknown) => {
              cleanup();
              throw error;
            });
      } catch (error) {
        return Promise.reject(signal?.aborted ? signal.reason : error);
      }
    };
  };

  const operator: ContextualOperator<This, Args, Result, Result> = {
    name: 'semaphore',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createWrapper(function (this: This, _context, ...args: Args) {
          return next.call(this, ...args);
        }),
      );
    },
    applyWithContext: createWrapper,
  };
  return operator;
}

export function semaphore<This, Args extends readonly unknown[], Result>(
  options: SemaphoreOptions<This, Args>,
): Operator<This, Args, Result, Result> {
  return createSemaphoreOperator(options);
}

export interface SemaphoreSnapshot {
  readonly active: number;
  readonly queued: number;
}

export interface SemaphoreHandle {
  inspect(key?: PropertyKey): SemaphoreSnapshot | undefined;
}

/** Creates a semaphore whose permit pools are shared by every application. */
export function semaphoreWithHandle<This, Args extends readonly unknown[], Result>(
  options: SemaphoreOptions<This, Args>,
): { readonly operator: Operator<This, Args, Result, Result>; readonly handle: SemaphoreHandle } {
  const pools = new Map<PropertyKey | undefined, PermitQueue>();
  const handle: SemaphoreHandle = Object.freeze({
    inspect(key?: PropertyKey): SemaphoreSnapshot | undefined {
      const pool = pools.get(key);
      if (pool === undefined) return undefined;
      return Object.freeze({ active: pool.activeCount, queued: pool.queueLength });
    },
  });
  return Object.freeze({
    operator: createSemaphoreOperator<This, Args, Result>(options, () => pools),
    handle,
  });
}
