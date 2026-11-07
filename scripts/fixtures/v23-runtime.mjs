import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const esmRoot = await import('annotations-design-patterns');
const cjsRoot = require('annotations-design-patterns');
const esmOperators = await import('annotations-design-patterns/operators');
const cjsOperators = require('annotations-design-patterns/operators');
const esmPipe = await import('annotations-design-patterns/pipe');
const esmRun = await import('annotations-design-patterns/run');

// Symbol-branded policy errors remain recognizable across independently bundled formats.
for (const [factory, guard] of [
  [esmOperators.rateLimit, cjsOperators.isRateLimitExceededError],
  [cjsOperators.rateLimit, esmOperators.isRateLimitExceededError],
]) {
  const limited = factory({ limit: 1, windowMs: 60_000 }).apply(() => 'ok');
  assert.equal(limited(), 'ok');
  await assert.rejects(limited(), (error) => guard(error) && error.code === 'POLICY_ERROR');
}

// Optimistic transition conflicts also cross root ESM and granular CJS exports.
const { TransitionTo } = cjsRoot;
class Machine extends esmRoot.StateMachine {
  constructor() {
    super('draft');
  }
}
let finishFirst;
const decorator = TransitionTo('published', { concurrency: 'reject-stale' });
const original = function (wait) {
  if (wait)
    return new Promise((resolve) => {
      finishFirst = resolve;
    });
  return 'done';
};
const publish = decorator(original, { kind: 'method', name: 'publish' });
const machine = new Machine();
const first = publish.call(machine, true);
assert.equal(publish.call(machine, false), 'done');
finishFirst('late');
await assert.rejects(first, (error) => esmRoot.isStateTransitionConflictError(error));
assert.equal(machine.state, 'published');

// executionMethod keeps the run context's effective signal when composed in a pipe.
let observedSignal;
const method = esmRun.executionMethod(function (execution, value) {
  observedSignal = execution.signal;
  return `${value}:${execution.operationId}`;
});
const composed = esmPipe.pipe(method, esmOperators.timeout(1_000));
const controller = new globalThis.AbortController();
assert.equal(
  await esmRun.run({}, ['ok'], composed, {
    signal: controller.signal,
    operationId: 'v23-smoke',
  }),
  'ok:v23-smoke',
);
assert.ok(observedSignal instanceof globalThis.AbortSignal);

// Bounded memoization and opt-in shared-work cancellation preserve a live consumer.
const sharedControllerA = new globalThis.AbortController();
const sharedControllerB = new globalThis.AbortController();
let sharedSignal;
// The contextual adapter is invoked through run so both calls join the same work.
const sharedMethod = esmRun.executionMethod((execution) => {
  sharedSignal = execution.signal;
  return new Promise(() => {});
});
const shared = esmPipe.pipe(
  sharedMethod,
  esmOperators.memoize({ maxEntries: 1, cancelWhenUnused: true }),
);
const receiver = {};
const resultA = esmRun.run(receiver, ['same'], shared, { signal: sharedControllerA.signal });
const resultB = esmRun.run(receiver, ['same'], shared, { signal: sharedControllerB.signal });
sharedControllerA.abort(new Error('one caller left'));
await assert.rejects(resultA);
assert.equal(sharedSignal.aborted, false);
sharedControllerB.abort(new Error('last caller left'));
await assert.rejects(resultB);
assert.equal(sharedSignal.aborted, true);

// Handles expose snapshots without allowing a caller to mutate internal state.
const breaker = esmOperators.circuitBreakerWithHandle({ failures: 1, resetMs: 60_000 });
assert.equal(breaker.handle.inspect(), undefined);
const failing = breaker.operator.apply(() => {
  throw new Error('trip');
});
const tripped = failing();
await assert.rejects(tripped);
assert.equal(breaker.handle.inspect().state, 'OPEN');
assert.ok(Object.isFrozen(breaker.handle.inspect()));
breaker.handle.reset();
assert.equal(breaker.handle.inspect().state, 'CLOSED');

const lock = esmOperators.keyedLockWithHandle({ key: ({ args }) => args[0] });
let releaseLock;
const lockMethodA = lock.operator.apply(async (value) => {
  await new Promise((resolve) => {
    releaseLock = resolve;
  });
  return `A:${value}`;
});
const lockMethodB = lock.operator.apply(async (value) => `B:${value}`);
const lockA = lockMethodA('shared');
const lockB = lockMethodB('shared');
assert.deepEqual(lock.handle.inspect('shared'), { active: 1, queued: 1 });
releaseLock();
assert.equal(await lockA, 'A:shared');
assert.equal(await lockB, 'B:shared');
assert.deepEqual(lock.handle.inspect('shared'), undefined);

const semaphore = cjsOperators.semaphoreWithHandle({ permits: 1 });
let releasePermit;
const semMethod = semaphore.operator.apply(async (value) => {
  if (value === 'active')
    await new Promise((resolve) => {
      releasePermit = resolve;
    });
  return value;
});
const activePermit = semMethod('active');
const queuedPermit = semMethod('queued');
assert.deepEqual(semaphore.handle.inspect(), { active: 1, queued: 1 });
releasePermit();
assert.equal(await activePermit, 'active');
assert.equal(await queuedPermit, 'queued');
assert.deepEqual(semaphore.handle.inspect(), undefined);

// Observer failures, including asynchronously rejected callbacks, do not escape.
let observed = 0;
const observer = (await import('annotations-design-patterns/experimental')).observeOperation({
  onComplete() {
    observed += 1;
    return Promise.reject(new Error('observer failure'));
  },
});
assert.equal(observer.apply(() => 7)(), 7);
await nextTurn();
assert.equal(observed, 1);

// Adapt the local versioned store to the intentionally small async cache contract.
const experimental = await import('annotations-design-patterns/experimental');
const memory = new experimental.VersionedMemoryStore();
const absent = await memory.read('cas');
assert.equal(absent.present, false);
const inserted = await memory.compareExchange('cas', absent.version, 'value');
assert.equal(inserted.exchanged, true);
assert.equal((await memory.compareExchange('cas', absent.version, 'stale')).exchanged, false);
const provider = {
  capabilities: { ttl: true },
  async get(key) {
    const entry = await memory.read(key);
    return entry.present ? entry.value : undefined;
  },
  async set(key, value, options) {
    const entry = await memory.read(key);
    await memory.compareExchange(key, entry.version, value, options?.ttlMs);
  },
};
const cached = experimental
  .asyncCachedFor(10_000, {
    store: provider,
    namespace: 'smoke',
    schemaVersion: '1',
    key: (value) => value,
    codec: { encode: (value) => value, decode: (value) => value },
    storeFailure: 'reject',
    ioTimeoutMs: 1_000,
  })
  .apply((value) => ({ value }));
assert.deepEqual(await cached('key'), { value: 'key' });
assert.deepEqual(await cached('key'), { value: 'key' });

console.log('2.3 packed runtime ESM/CJS OK');
