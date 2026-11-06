import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AbortController } = globalThis;
for (const format of ['esm', 'cjs']) {
  const load = (subpath) =>
    format === 'esm'
      ? import(`annotations-design-patterns/${subpath}`)
      : Promise.resolve(require(`annotations-design-patterns/${subpath}`));
  const { pipe } = await load('pipe');
  const { run } = await load('run');
  const {
    fallback,
    memoize,
    cachedFor,
    circuitBreaker,
    retry,
    semaphore,
    SemaphoreQueueFullError,
    overlap,
    timeout,
  } = await load('operators');
  const controller = new AbortController();
  const reason = new Error(`${format} caller cancellation`);
  let fallbacks = 0;
  const cancelled = pipe(
    () => new Promise(() => {}),
    fallback(() => {
      fallbacks++;
      return 'fallback';
    }),
    timeout(100),
  );
  const call = run({}, [], cancelled, { signal: controller.signal });
  const assertion = assert.rejects(Promise.resolve(call), (error) => error === reason);
  controller.abort(reason);
  await assertion;
  assert.equal(fallbacks, 0);

  let complete;
  const work = new Promise((resolve) => {
    complete = resolve;
  });
  const shared = pipe(() => work, memoize(), timeout(100));
  const firstController = new AbortController();
  const first = run({}, [], shared, { signal: firstController.signal });
  const second = run({}, [], shared, {});
  const firstAssertion = assert.rejects(Promise.resolve(first), (error) => error === reason);
  firstController.abort(reason);
  await firstAssertion;
  complete('shared');
  assert.equal(await second, 'shared');
  assert.equal(await run({}, [], shared, {}), 'shared');

  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const starts = [];
  const queued = pipe(
    (id) => {
      starts.push(id);
      return id === 'active' ? barrier : id;
    },
    overlap({ mode: 'queue', key: () => 'key', maxQueue: 1 }),
  );
  const active = run({}, ['active'], queued, {});
  const waiterController = new AbortController();
  const waiter = run({}, ['cancelled'], queued, { signal: waiterController.signal });
  const waiterAssertion = assert.rejects(Promise.resolve(waiter), (error) => error === reason);
  waiterController.abort(reason);
  await waiterAssertion;
  const last = run({}, ['last'], queued, {});
  release('active');
  await active;
  assert.equal(await last, 'last');
  assert.deepEqual(starts, ['active', 'last']);

  const perReceiver = memoize({ perReceiver: true }).apply(function () {
    return this.tenant;
  });
  assert.equal(perReceiver.call({ tenant: 'a' }), 'a');
  assert.equal(perReceiver.call({ tenant: 'b' }), 'b');
  let cacheCalls = 0;
  const bounded = cachedFor(Infinity, { maxEntries: 1 }).apply((key) => {
    cacheCalls++;
    return key;
  });
  for (const key of ['a', 'b', 'a']) assert.equal(bounded.call({}, key), key);
  assert.equal(cacheCalls, 3);

  let finishPermit;
  const permitWork = new Promise((resolve) => {
    finishPermit = resolve;
  });
  const limited = semaphore({ permits: 1, maxQueue: 0 }).apply(() => permitWork);
  const holder = limited.call({});
  await assert.rejects(Promise.resolve(limited.call({})), SemaphoreQueueFullError);
  finishPermit('released');
  assert.equal(await holder, 'released');
  assert.equal(await limited.call({}), 'released');

  const businessError = new Error('ignored by classifier');
  let breakerCalls = 0;
  const classified = circuitBreaker({ failures: 1, resetMs: 100, isFailure: () => false }).apply(
    () => {
      breakerCalls++;
      throw businessError;
    },
  );
  for (let index = 0; index < 2; index++) {
    await assert.rejects(Promise.resolve(classified.call({})), (error) => error === businessError);
  }
  assert.equal(breakerCalls, 2);
  let retryCalls = 0;
  const capped = retry({ attempts: 2, delayMs: 100, maxDelayMs: 0, jitter: 'full' }).apply(() => {
    if (++retryCalls === 1) throw businessError;
    return 'retried';
  });
  assert.equal(await capped.call({}), 'retried');
  assert.equal(retryCalls, 2);
}
console.log('RC cancellation/queue/semaphore/cache/classification/retry smoke ESM+CJS OK');
