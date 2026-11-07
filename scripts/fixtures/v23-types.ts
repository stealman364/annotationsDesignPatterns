import {
  StateMachine,
  TransitionTo,
  isStateTransitionConflictError,
  type TransitionToOptions,
} from 'annotations-design-patterns';
import { executionMethod, run } from 'annotations-design-patterns/run';
import {
  rateLimit,
  isRateLimitExceededError,
  memoize,
  circuitBreakerWithHandle,
  keyedLockWithHandle,
  semaphoreWithHandle,
  type RateLimitOptions,
} from 'annotations-design-patterns/operators';
import { createCounterSink } from 'annotations-design-patterns/observability';
import {
  observeOperation,
  asyncCachedFor,
  VersionedMemoryStore,
  type AsyncCacheProvider,
  type AsyncCacheCodec,
  type VersionedAsyncStore,
  type VersionedStoreEntry,
} from 'annotations-design-patterns/experimental';

const rateOptions: RateLimitOptions = { limit: 2, windowMs: 1_000 };
rateLimit(rateOptions);
// @ts-expect-error A rate window must be positive and expressed as a number.
rateLimit({ limit: 2, windowMs: '1000' });
void isRateLimitExceededError(new Error());

type State = 'draft' | 'published';
const transitionOptions: TransitionToOptions = { concurrency: 'reject-stale' };
class Document extends StateMachine<State> {
  publish(): string {
    return 'published';
  }
}
const document = new Document('draft');
const transition = TransitionTo<'published'>('published', transitionOptions);
void transition;
void document;
void isStateTransitionConflictError(new Error());
// @ts-expect-error StateMachine exposes only its declared state union.
document.transitionTo('deleted');

const execution = executionMethod(function (_info, value: string): number {
  return value.length;
});
const exactNumber: number = execution('value');
// @ts-expect-error executionMethod preserves the callback's synchronous return type.
const wrongReturn: string = execution('value');
void exactNumber;
void wrongReturn;
const contextualMethod = executionMethod((_info, value: string) => value);
void run({}, ['x'], contextualMethod);
memoize({ maxEntries: 4, cancelWhenUnused: true });
// @ts-expect-error maxEntries must be numeric.
memoize({ maxEntries: '4' });

const breaker = circuitBreakerWithHandle({ failures: 2, resetMs: 1_000 });
const breakerSnapshot = breaker.handle.inspect();
if (breakerSnapshot) {
  const state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = breakerSnapshot.state;
  void state;
  // @ts-expect-error Handle snapshots are readonly.
  breakerSnapshot.state = 'CLOSED';
}
const lock = keyedLockWithHandle({ key: ({ args }) => String(args[0]), maxQueue: 2 });
const lockSnapshot = lock.handle.inspect('key');
const semaphore = semaphoreWithHandle({ permits: 2, maxQueue: 1 });
void lockSnapshot;
void semaphore.handle.inspect();
breaker.handle.reset();
lock.handle.inspect('key');
semaphore.handle.inspect('key');

const sink = createCounterSink(() => undefined);
void sink;
const observer = observeOperation({ onComplete: (observation) => observation.outcome });
void observer;

const memory: VersionedAsyncStore<string> = new VersionedMemoryStore<string>();
const initial: Promise<VersionedStoreEntry<string>> = memory.read('key');
const provider: AsyncCacheProvider = {
  capabilities: { ttl: true },
  get: async () => undefined,
  set: async () => undefined,
};
const codec: AsyncCacheCodec<string> = {
  encode: (value) => value,
  decode: (value) => String(value),
};
const cached = asyncCachedFor<unknown, [string], string>(1_000, {
  store: provider,
  namespace: 'types',
  schemaVersion: '1',
  key: (value) => value,
  codec,
  storeFailure: 'reject',
  ioTimeoutMs: 1_000,
});
void cached;
void initial;
asyncCachedFor(1_000, {
  store: provider,
  // @ts-expect-error Cache namespaces must be strings.
  namespace: 1,
  schemaVersion: '1',
  key: () => 'k',
  codec,
  storeFailure: 'reject',
  ioTimeoutMs: 1_000,
});
