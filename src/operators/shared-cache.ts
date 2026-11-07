import {
  createOperationContext,
  emitPolicyEvent,
  type ContextualMethod,
  type RuntimeOperationContext,
} from '../core/context';
import { raceWithSignal, withSharedExecutionSignal } from '../core/cancellation';
import { SharedExecution } from '../core/shared-execution';
import type { MaybePromise } from '../core/types';
import { CacheHandleStore } from './cache-handle';

export interface SharedCacheValue<Result> {
  value: MaybePromise<Result>;
  execution?: SharedExecution<Result>;
}

/** Reserve membership and lookup before events or business code can reenter. */
export function startSharedCache<
  This,
  Args extends readonly unknown[],
  Result,
  Entry extends SharedCacheValue<Result>,
>(
  cache: CacheHandleStore<Entry>,
  key: string,
  operator: 'memoize' | 'cachedFor',
  next: ContextualMethod<This, Args, Result>,
  receiver: This,
  args: Args,
  context: RuntimeOperationContext<This, Args> | undefined,
  createEntry: (value: MaybePromise<Result>) => Entry,
): MaybePromise<Result> {
  const removeCurrent = (): boolean => {
    const entry = cache.get(key);
    return entry !== undefined && entry.value === value && cache.deleteIfCurrent(key, entry);
  };
  const execution = new SharedExecution<Result>(removeCurrent, (success, error) => {
    value.execution = undefined;
    if (!success && removeCurrent())
      emitPolicyEvent(context, operator, 'cache.rejected', { error });
  });
  const value = createEntry(execution.promise);
  value.execution = execution;
  // The first consumer belongs to the reservation before cache eviction observers run.
  execution.join(context?.signal);
  cache.set(key, value, context);
  emitPolicyEvent(context, operator, 'cache.miss', {});
  const executionContext = withSharedExecutionSignal(
    context ?? createOperationContext(receiver, args, {}),
    execution.signal,
  );
  try {
    const result = execution.start(() => next.call(receiver, executionContext, ...args));
    value.value = result;
    return raceWithSignal(result, context?.signal);
  } catch (error) {
    if (context?.signal?.aborted === true) return Promise.reject(context.signal.reason);
    throw error;
  }
}
