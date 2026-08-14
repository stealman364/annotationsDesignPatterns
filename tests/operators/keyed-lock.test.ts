import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import type { AnyMethod, Operator } from '../../src/public/types';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';
import { TimeoutError, timeout } from '../../src/operators/timeout';
import {
  keyedLock,
  KeyedLockQueueFullError,
  type KeyedLockKeyContext,
  type KeyedLockOptions,
} from '../../src/operators/keyed-lock';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });

  return {
    promise,
    resolve(value: Value): void {
      resolve?.(value);
    },
    reject(reason: unknown): void {
      reject?.(reason);
    },
  };
}

function keyFromArgument(context: KeyedLockKeyContext<Receiver, Args>): PropertyKey {
  return context.args[0];
}

function recordingSink(events: PolicyEvent[]): EventSink {
  return {
    emit(event): void {
      events.push(event);
    },
  };
}

describe('keyedLock operator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializes matching keys in FIFO order and accepts a fresh call after the queue drains', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();
    const afterDrain = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      switch (id) {
        case 'first':
          return first.promise;
        case 'second':
          return second.promise;
        case 'third':
          return third.promise;
        default:
          return afterDrain.promise;
      }
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: 2 }),
    );

    const firstCall = operation.call(receiver, 'first');
    const secondCall = operation.call(receiver, 'second');
    const thirdCall = operation.call(receiver, 'third');

    expect(starts).toEqual(['first']);

    first.resolve('first');
    await expect(firstCall).resolves.toBe('first');
    expect(starts).toEqual(['first', 'second']);

    second.resolve('second');
    await expect(secondCall).resolves.toBe('second');
    expect(starts).toEqual(['first', 'second', 'third']);

    third.resolve('third');
    await expect(thirdCall).resolves.toBe('third');

    const after = operation.call(receiver, 'after');

    expect(starts).toEqual(['first', 'second', 'third', 'after']);
    afterDrain.resolve('after');
    await expect(after).resolves.toBe('after');
  });

  it('drains many synchronous waiters after an asynchronous holder without overflowing', async () => {
    const active = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const waiterCount = 12_000;
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string | Promise<string> {
      calls += 1;
      return id === 'active' ? active.promise : `${this.prefix}:${id}`;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: waiterCount }),
    );

    const first = operation.call(receiver, 'active');
    const waiters = Array.from({ length: waiterCount }, (_, index) =>
      operation.call(receiver, `queued-${index}`),
    );
    const completion = Promise.all([first, ...waiters]);

    active.resolve('active');

    await expect(completion).resolves.toHaveLength(waiterCount + 1);
    expect(calls).toBe(waiterCount + 1);
  });

  it('allows independent resolver keys to run concurrently', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      return id === 'first' ? first.promise : second.promise;
    };
    const operation = pipe(method, keyedLock<Receiver, Args, string>({ key: keyFromArgument }));

    const firstCall = operation.call(receiver, 'first');
    const secondCall = operation.call(receiver, 'second');

    expect(starts).toEqual(['first', 'second']);

    first.resolve('first');
    second.resolve('second');
    await expect(firstCall).resolves.toBe('first');
    await expect(secondCall).resolves.toBe('second');
  });

  it('releases completed synchronous keys after many distinct keys so a repeated key starts immediately', () => {
    const receiver: Receiver = { prefix: 'api' };
    const distinctKeyCount = 2_000;
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}`;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: keyFromArgument, maxQueue: 0 }),
    );

    expect(operation.call(receiver, 'key-0')).toBe('api:key-0');
    for (let index = 1; index <= distinctKeyCount; index += 1) {
      const key = `key-${index}`;
      expect(operation.call(receiver, key)).toBe(`api:${key}`);
    }

    expect(operation.call(receiver, 'key-0')).toBe('api:key-0');
    expect(calls).toBe(distinctKeyCount + 2);
  });

  it('releases the key after an active operation fails', async () => {
    const failure = new Error('upstream failure');
    const first = deferred<string>();
    const queued = deferred<string>();
    const afterFailure = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      if (id === 'first') {
        return first.promise;
      }
      return id === 'queued' ? queued.promise : afterFailure.promise;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: 1 }),
    );

    const firstCall = operation.call(receiver, 'first');
    const queuedCall = operation.call(receiver, 'queued');

    first.reject(failure);
    await expect(firstCall).rejects.toBe(failure);
    expect(starts).toEqual(['first', 'queued']);

    queued.resolve('queued');
    await expect(queuedCall).resolves.toBe('queued');

    const after = operation.call(receiver, 'after');

    expect(starts).toEqual(['first', 'queued', 'after']);
    afterFailure.resolve('after');
    await expect(after).resolves.toBe('after');
  });

  it('rejects an entry beyond maxQueue without counting the active holder', async () => {
    const active = deferred<string>();
    const queued = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      return id === 'active' ? active.promise : queued.promise;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: 1 }),
    );

    const activeCall = operation.call(receiver, 'active');
    const queuedCall = operation.call(receiver, 'queued');
    const rejected = operation.call(receiver, 'rejected');

    expect(starts).toEqual(['active']);
    await expect(rejected).rejects.toBeInstanceOf(KeyedLockQueueFullError);

    active.resolve('active');
    await expect(activeCall).resolves.toBe('active');
    expect(starts).toEqual(['active', 'queued']);

    queued.resolve('queued');
    await expect(queuedCall).resolves.toBe('queued');
  });

  it('removes an aborted waiting call so later work can acquire the key', async () => {
    const active = deferred<string>();
    const later = deferred<string>();
    const controller = new AbortController();
    const abortReason = new Error('deadline elapsed');
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      return id === 'active' ? active.promise : later.promise;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: 2 }),
    );

    const activeCall = run(receiver, ['active'] as const, operation, { key: 'account' });
    const abortedCall = run(receiver, ['aborted'] as const, operation, {
      key: 'account',
      signal: controller.signal,
    });
    const laterCall = run(receiver, ['later'] as const, operation, { key: 'account' });

    expect(starts).toEqual(['active']);

    controller.abort(abortReason);
    await expect(abortedCall).rejects.toBe(abortReason);

    active.resolve('active');
    await expect(activeCall).resolves.toBe('active');
    expect(starts).toEqual(['active', 'later']);

    later.resolve('later');
    await expect(laterCall).resolves.toBe('later');
  });

  it('releases queue progress when an active holder times out inside the keyed lock', async () => {
    vi.useFakeTimers();
    const active = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string | Promise<string> {
      starts.push(id);
      return id === 'active' ? active.promise : `${this.prefix}:${id}`;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account' }),
      timeout<Receiver, Args, string>(10),
    );

    const holder = run(receiver, ['active'] as const, operation, { key: 'account' });
    const waiting = run(receiver, ['waiting'] as const, operation, { key: 'account' });
    const timeoutAssertion = expect(holder).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(10);

    await timeoutAssertion;
    await expect(waiting).resolves.toBe('api:waiting');
    expect(starts).toEqual(['active', 'waiting']);
    expect(vi.getTimerCount()).toBe(0);

    active.resolve('late completion');
    await Promise.resolve();
  });

  it('releases queue progress when a propagated signal aborts an inner timeout wrapper', async () => {
    vi.useFakeTimers();
    const active = deferred<string>();
    const controller = new AbortController();
    const abortReason = new Error('caller deadline elapsed');
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string | Promise<string> {
      starts.push(id);
      return id === 'active' ? active.promise : `${this.prefix}:${id}`;
    };
    const operation = pipe(
      method,
      keyedLock<Receiver, Args, string>({ key: () => 'account' }),
      timeout<Receiver, Args, string>(1_000),
    );

    const holder = run(receiver, ['active'] as const, operation, {
      key: 'account',
      signal: controller.signal,
    });
    const waiting = run(receiver, ['waiting'] as const, operation, { key: 'account' });
    const abortAssertion = expect(holder).rejects.toBe(abortReason);

    controller.abort(abortReason);

    await abortAssertion;
    await expect(waiting).resolves.toBe('api:waiting');
    expect(starts).toEqual(['active', 'waiting']);
    expect(vi.getTimerCount()).toBe(0);

    active.resolve('late completion');
    await Promise.resolve();
  });

  it('does not forcibly release a bare active keyed lock when its signal aborts', async () => {
    const active = deferred<string>();
    const queued = deferred<string>();
    const controller = new AbortController();
    const receiver: Receiver = { prefix: 'api' };
    const starts: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      return id === 'active' ? active.promise : queued.promise;
    };
    const operation = pipe(method, keyedLock<Receiver, Args, string>({ key: () => 'account' }));

    const holder = run(receiver, ['active'] as const, operation, {
      key: 'account',
      signal: controller.signal,
    });
    const waiting = run(receiver, ['waiting'] as const, operation, { key: 'account' });

    controller.abort(new Error('caller stopped waiting'));
    await Promise.resolve();

    expect(starts).toEqual(['active']);

    active.resolve('active complete');
    await expect(holder).resolves.toBe('active complete');
    expect(starts).toEqual(['active', 'waiting']);

    queued.resolve('waiting complete');
    await expect(waiting).resolves.toBe('waiting complete');
  });

  it('rejects a pre-aborted holder before execution and cleans its key state', async () => {
    const controller = new AbortController();
    const reason = new Error('caller cancelled before acquisition');
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const operation = pipe(
      function (this: Receiver, id: string): string {
        calls += 1;
        return `${this.prefix}:${id}`;
      },
      keyedLock<Receiver, Args, string>({ key: () => 'account' }),
    );

    controller.abort(reason);

    const rejected = run(receiver, ['cancelled'] as const, operation, {
      key: 'account',
      signal: controller.signal,
    });

    await expect(rejected).rejects.toBe(reason);
    expect(calls).toBe(0);
    expect(operation.call(receiver, 'next')).toBe('api:next');
    expect(calls).toBe(1);
  });

  it('rejects invalid queue limits when the lock is constructed', () => {
    const options = { key: keyFromArgument };

    expect(() => keyedLock<Receiver, Args, string>({ ...options, maxQueue: -1 })).toThrow(
      RangeError,
    );
    expect(() => keyedLock<Receiver, Args, string>({ ...options, maxQueue: 1.5 })).toThrow(
      RangeError,
    );
  });

  it('supports direct Operator.apply calls without a run context', () => {
    const receiver: Receiver = { prefix: 'api' };
    const operator = keyedLock<Receiver, Args, string>({ key: keyFromArgument });
    const protectedMethod = operator.apply(function (this: Receiver, id: string): string {
      return `${this.prefix}:${id}`;
    });

    expect(protectedMethod.call(receiver, 'account')).toBe('api:account');
  });

  it('emits queued, acquired, and released events with each invocation context', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const events: PolicyEvent[] = [];
    const receiver: Receiver = { prefix: 'api' };
    const operation = pipe(
      function (_id: string): Promise<string> {
        return _id === 'first' ? first.promise : second.promise;
      },
      keyedLock<Receiver, Args, string>({ key: () => 'account', maxQueue: 1 }),
    );

    const firstCall = run(receiver, ['first'] as const, operation, {
      operationId: 'lock-first',
      eventSink: recordingSink(events),
    });
    const secondCall = run(receiver, ['second'] as const, operation, {
      operationId: 'lock-second',
      eventSink: recordingSink(events),
    });

    first.resolve('first');
    await expect(firstCall).resolves.toBe('first');
    second.resolve('second');
    await expect(secondCall).resolves.toBe('second');

    expect(events.map((event) => event.kind)).toEqual([
      'keyedLock.acquired',
      'keyedLock.queued',
      'keyedLock.released',
      'keyedLock.acquired',
      'keyedLock.released',
    ]);
    expect(events.map((event) => event.operationId)).toEqual([
      'lock-first',
      'lock-second',
      'lock-first',
      'lock-second',
      'lock-second',
    ]);
  });

  it('keeps resolver arguments readonly and preserves sync and async operator types', () => {
    const options: KeyedLockOptions<Receiver, Args> = {
      key: keyFromArgument,
      maxQueue: 1,
    };

    expectTypeOf<KeyedLockKeyContext<Receiver, Args>['args']>().toEqualTypeOf<Args>();
    expectTypeOf(keyedLock<Receiver, Args, string>(options)).toMatchTypeOf<
      Operator<Receiver, Args, string, string>
    >();
    expectTypeOf(
      keyedLock<Receiver, Args, Promise<string>>({ key: keyFromArgument }),
    ).toMatchTypeOf<Operator<Receiver, Args, Promise<string>, Promise<string>>>();
  });
});
