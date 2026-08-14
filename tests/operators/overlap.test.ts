import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import type { AnyMethod, Operator } from '../../src/public/types';
import { overlap, OverlapDroppedError, OverlapQueueFullError } from '../../src/operators/overlap';
import type { OverlapKeyContext, OverlapOptions } from '../../src/operators/overlap-types';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

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

function recordingSink(events: PolicyEvent[]): EventSink {
  return {
    emit(event): void {
      events.push(event);
    },
  };
}

function keyFromArgument(context: OverlapKeyContext<Receiver, Args>): PropertyKey {
  return context.args[0];
}

describe('overlap operator', () => {
  it('drops an active matching call, prefers the run key, and preserves run context in events', async () => {
    const pending = deferred<string>();
    const events: PolicyEvent[] = [];
    const metadata = { requestId: 'overlap-drop' } as const;
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    let resolverCalls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return pending.promise;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({
        mode: 'drop',
        key(): PropertyKey {
          resolverCalls += 1;
          return 'resolver-key';
        },
      }),
    );

    const first = run(receiver, ['first'] as const, operation, {
      operationId: 'drop-first',
      metadata,
      eventSink: recordingSink(events),
      key: 'run-key',
    });
    const dropped = run(receiver, ['second'] as const, operation, {
      operationId: 'drop-second',
      metadata,
      eventSink: recordingSink(events),
      key: 'run-key',
    });

    expect(calls).toBe(1);
    expect(resolverCalls).toBe(0);
    await expect(dropped).rejects.toBeInstanceOf(OverlapDroppedError);

    pending.resolve('complete');
    await expect(first).resolves.toBe('complete');

    expect(events.map((event) => event.kind)).toEqual([
      'overlap.started',
      'overlap.dropped',
      'overlap.completed',
    ]);
    expect(events.map((event) => event.operationId)).toEqual([
      'drop-first',
      'drop-second',
      'drop-first',
    ]);
    expect(events.map((event) => event.operator)).toEqual(['overlap', 'overlap', 'overlap']);
    expect(events.map((event) => event.metadata)).toEqual([metadata, metadata, metadata]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'overlap.started', key: 'run-key' }),
        expect.objectContaining({ kind: 'overlap.dropped', key: 'run-key' }),
        expect.objectContaining({ kind: 'overlap.completed', key: 'run-key' }),
      ]),
    );
  });

  it('uses the explicit resolver with readonly run context when no run key is supplied', () => {
    const receiver: Receiver = { prefix: 'api' };
    const metadata = { tenant: 'acme' } as const;
    let observed: OverlapKeyContext<Receiver, Args> | undefined;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      return `${this.prefix}:${id}`;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({
        mode: 'drop',
        key(context): PropertyKey {
          observed = context;
          return context.args[0];
        },
      }),
    );

    expect(
      run(receiver, ['account'] as const, operation, {
        operationId: 'resolver-context',
        metadata,
      }),
    ).toBe('api:account');
    expect(observed).toMatchObject({
      receiver,
      args: ['account'],
      operationId: 'resolver-context',
      metadata,
      key: undefined,
      signal: undefined,
    });
  });

  it('shares the exact pending Promise for equivalent resolver keys', async () => {
    const pending = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return pending.promise;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({ mode: 'share', key: keyFromArgument }),
    );

    const first = operation.call(receiver, 'account');
    const shared = operation.call(receiver, 'account');

    expect(shared).toBe(first);
    expect(calls).toBe(1);

    pending.resolve('complete');
    await expect(first).resolves.toBe('complete');
    await expect(shared).resolves.toBe('complete');
  });

  it('shares one rejection and removes the shared entry before a later invocation', async () => {
    const failure = new Error('dependency failed');
    const firstAttempt = deferred<string>();
    const replacementAttempt = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? firstAttempt.promise : replacementAttempt.promise;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({ mode: 'share', key: keyFromArgument }),
    );

    const first = operation.call(receiver, 'account');
    const shared = operation.call(receiver, 'account');

    expect(shared).toBe(first);
    firstAttempt.reject(failure);
    await expect(first).rejects.toBe(failure);
    await expect(shared).rejects.toBe(failure);

    const replacement = operation.call(receiver, 'account');

    expect(replacement).not.toBe(first);
    expect(calls).toBe(2);
    replacementAttempt.resolve('recovered');
    await expect(replacement).resolves.toBe('recovered');
  });

  it('drops a same-key reentrant call before executing its body again', async () => {
    const pending = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const operationReference: { current?: AnyMethod<Receiver, Args, string> } = {};
    let reentrantOutcome: Promise<unknown> | undefined;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        if (operationReference.current === undefined) {
          throw new Error('The overlap operation was not initialized');
        }
        reentrantOutcome = Promise.resolve(
          operationReference.current.call(receiver, 'reentrant'),
        ).then(
          () => undefined,
          (error: unknown) => error,
        );
      }
      return pending.promise;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({ mode: 'drop', key: () => 'account' }),
    );
    operationReference.current = operation;

    const primary = operation.call(receiver, 'primary');
    pending.resolve('primary-result');

    await expect(primary).resolves.toBe('primary-result');
    expect(calls).toBe(1);
    if (reentrantOutcome === undefined) {
      throw new Error('Expected the reentrant call to be observed');
    }
    await expect(reentrantOutcome).resolves.toBeInstanceOf(OverlapDroppedError);
  });

  it('shares a same-key reentrant call without executing its body again', async () => {
    const pending = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const operationReference: { current?: AnyMethod<Receiver, Args, string> } = {};
    let reentrant: ReturnType<AnyMethod<Receiver, Args, string>> | undefined;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        if (operationReference.current === undefined) {
          throw new Error('The overlap operation was not initialized');
        }
        reentrant = operationReference.current.call(receiver, 'reentrant');
      }
      return pending.promise;
    };
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({ mode: 'share', key: () => 'account' }),
    );
    operationReference.current = operation;

    const primary = operation.call(receiver, 'primary');
    pending.resolve('shared-result');

    await expect(primary).resolves.toBe('shared-result');
    expect(calls).toBe(1);
    if (reentrant === undefined) {
      throw new Error('Expected the reentrant call to be created');
    }
    await expect(reentrant).resolves.toBe('shared-result');
  });

  it('starts queued calls in FIFO order and cleans the key after a successful drain', async () => {
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
      overlap<Receiver, Args, string>({ mode: 'queue', key: () => 'account', maxQueue: 2 }),
    );

    const firstCall = operation.call(receiver, 'first');
    const secondCall = operation.call(receiver, 'second');
    const thirdCall = operation.call(receiver, 'third');

    expect(starts).toEqual(['first']);

    second.resolve('second');
    third.resolve('third');
    first.resolve('first');

    await expect(firstCall).resolves.toBe('first');
    await expect(secondCall).resolves.toBe('second');
    await expect(thirdCall).resolves.toBe('third');
    expect(starts).toEqual(['first', 'second', 'third']);

    const after = operation.call(receiver, 'after');

    expect(starts).toEqual(['first', 'second', 'third', 'after']);
    afterDrain.resolve('after');
    await expect(after).resolves.toBe('after');
  });

  it('drains many synchronous waiters after an asynchronous active call without overflowing', async () => {
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
      overlap<Receiver, Args, string>({
        mode: 'queue',
        key: () => 'account',
        maxQueue: waiterCount,
      }),
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

  it('does not count the active execution against maxQueue and rejects the next waiter', async () => {
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
      overlap<Receiver, Args, string>({ mode: 'queue', key: () => 'account', maxQueue: 1 }),
    );

    const activeCall = operation.call(receiver, 'active');
    const queuedCall = operation.call(receiver, 'queued');
    const rejected = operation.call(receiver, 'rejected');

    expect(starts).toEqual(['active']);
    await expect(rejected).rejects.toBeInstanceOf(OverlapQueueFullError);

    queued.resolve('queued');
    active.resolve('active');
    await expect(activeCall).resolves.toBe('active');
    await expect(queuedCall).resolves.toBe('queued');
    expect(starts).toEqual(['active', 'queued']);
  });

  it('releases queued work and the key when an active invocation rejects', async () => {
    const failure = new Error('first failed');
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
      overlap<Receiver, Args, string>({ mode: 'queue', key: () => 'account', maxQueue: 1 }),
    );

    const firstCall = operation.call(receiver, 'first');
    const queuedCall = operation.call(receiver, 'queued');

    queued.resolve('queued');
    first.reject(failure);
    await expect(firstCall).rejects.toBe(failure);
    await expect(queuedCall).resolves.toBe('queued');
    expect(starts).toEqual(['first', 'queued']);

    const after = operation.call(receiver, 'after');

    expect(starts).toEqual(['first', 'queued', 'after']);
    afterFailure.resolve('after');
    await expect(after).resolves.toBe('after');
  });

  it('does not block independent resolver keys', async () => {
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
    const operation = pipe(
      method,
      overlap<Receiver, Args, string>({ mode: 'queue', key: keyFromArgument, maxQueue: 1 }),
    );

    const firstCall = operation.call(receiver, 'first');
    const secondCall = operation.call(receiver, 'second');

    expect(starts).toEqual(['first', 'second']);
    first.resolve('first');
    second.resolve('second');
    await expect(firstCall).resolves.toBe('first');
    await expect(secondCall).resolves.toBe('second');
  });

  it('keeps key-context arguments readonly and supports sync and async operator types', () => {
    const options: OverlapOptions<Receiver, Args> = {
      mode: 'drop',
      key: keyFromArgument,
    };

    expectTypeOf<OverlapKeyContext<Receiver, Args>['args']>().toEqualTypeOf<Args>();
    expectTypeOf(overlap<Receiver, Args, string>(options)).toMatchTypeOf<
      Operator<Receiver, Args, string, string>
    >();
    expectTypeOf(
      overlap<Receiver, Args, Promise<string>>({
        mode: 'share',
        key: keyFromArgument,
      }),
    ).toMatchTypeOf<Operator<Receiver, Args, Promise<string>, Promise<string>>>();
  });
});
