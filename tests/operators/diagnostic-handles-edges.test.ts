import { expect, it } from 'vitest';
import { createOperationContext, type ContextualMethod } from '../../src/core/context';
import { keyedLock, keyedLockWithHandle } from '../../src/operators/keyed-lock';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('surfaces a throwing then getter and releases the keyed lock for the next call', async () => {
  const failure = new Error('then getter failure');
  const value = Object.defineProperty({}, 'then', {
    get() {
      throw failure;
    },
  });
  const method = pipe(
    (useThenable: boolean) =>
      useThenable ? (value as unknown as PromiseLike<string>) : 'released',
    keyedLock({ key: () => 'key' }),
  );

  const rejected = Promise.resolve(method.call({}, true));
  await expect(rejected).rejects.toBe(failure);
  expect(method.call({}, false)).toBe('released');
});

it('rejects a waiter if its signal aborts while its listener is being detached', async () => {
  const active = deferred<string>();
  const { operator, handle } = keyedLockWithHandle<object, readonly [], string>({
    key: () => 'key',
  });
  const holder = pipe(() => active.promise, operator);
  const waiting = pipe(() => 'should not run', operator);
  const held = holder.call({});
  let aborted = false;
  const signal = {
    get aborted() {
      return aborted;
    },
    reason: undefined,
    addEventListener() {},
    removeEventListener() {
      aborted = true;
    },
  } as unknown as AbortSignal;
  const queued = run({}, [], waiting, { signal });

  expect(handle.inspect('key')).toEqual({ active: 1, queued: 1 });
  active.resolve('held');
  await expect(held).resolves.toBe('held');
  await expect(queued).rejects.toThrow('Keyed lock wait aborted');
  expect(handle.inspect('key')).toBeUndefined();
});

it('withdraws a queued call if its signal aborts while the listener is registered', async () => {
  const active = deferred<string>();
  const { operator, handle } = keyedLockWithHandle<object, readonly [], string>({
    key: () => 'key',
  });
  const holder = pipe(() => active.promise, operator);
  const queuedMethod = pipe(() => 'should not run', operator);
  const held = holder.call({});
  let aborted = false;
  const signal = {
    get aborted() {
      return aborted;
    },
    reason: undefined,
    addEventListener() {
      aborted = true;
    },
    removeEventListener() {},
  } as unknown as AbortSignal;
  const queued = run({}, [], queuedMethod, { signal });

  await expect(queued).rejects.toThrow('Keyed lock wait aborted');
  expect(handle.inspect('key')).toEqual({ active: 1, queued: 0 });
  active.resolve('held');
  await expect(held).resolves.toBe('held');
  expect(handle.inspect('key')).toBeUndefined();
});

it('rejects an already-aborted keyed-lock waiter before adding it to the queue', async () => {
  const active = deferred<string>();
  const operator = keyedLock<object, readonly [], string>({ key: () => 'key' }) as unknown as {
    applyWithContext(
      next: ContextualMethod<object, readonly [], string>,
    ): ContextualMethod<object, readonly [], string>;
  };
  let first = true;
  const method = operator.applyWithContext(() => {
    if (first) {
      first = false;
      return active.promise;
    }
    return 'should not run';
  });
  const held = method.call({}, undefined);
  const signal = {
    aborted: true,
    reason: undefined,
    addEventListener() {},
    removeEventListener() {},
  } as unknown as AbortSignal;
  const context = createOperationContext({}, [] as const, { signal });

  await expect(method.call({}, context)).rejects.toThrow('Keyed lock wait aborted');
  active.resolve('unused');
  await expect(held).resolves.toBe('unused');
});

it('rejects construction without a key resolver', () => {
  expect(() => keyedLock({ key: undefined as never })).toThrow(/key resolver/);
});
