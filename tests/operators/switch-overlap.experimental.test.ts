import { describe, expect, expectTypeOf, it } from 'vitest';
import type { Operator } from '../../src/core/operator';
import type { AnyMethod } from '../../src/core/types';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import { OverlapSupersededError, switchOverlap } from '../../src/experimental/switch-overlap';
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

describe('experimental switchOverlap operator', () => {
  it('preserves a synchronous result and its operator type when no call is active', () => {
    const receiver: Receiver = { prefix: 'api' };
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      return `${this.prefix}:${id}`;
    };
    const operator = switchOverlap<Receiver, Args, string>({ key: ({ args }) => args[0] });
    const operation = operator.apply(method);

    expectTypeOf(operator).toMatchTypeOf<Operator<Receiver, Args, string, string>>();
    expect(operation.call(receiver, 'account')).toBe('api:account');
  });

  it('rejects a missing key resolver at operator creation', () => {
    const unsafeOptions = {} as unknown as {
      readonly key: (context: { readonly args: Args }) => PropertyKey;
    };

    expect(() => switchOverlap<Receiver, Args, string>(unsafeOptions)).toThrow(TypeError);
  });

  it('rethrows a synchronous failure and frees its key for a later call', () => {
    const failure = new Error('synchronous failure');
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      if (calls === 1) {
        throw failure;
      }
      return `${this.prefix}:${id}`;
    };
    const operation = pipe(method, switchOverlap<Receiver, Args, string>({ key: () => 'account' }));

    expect(() => operation.call(receiver, 'first')).toThrow(failure);
    expect(operation.call(receiver, 'second')).toBe('api:second');
    expect(calls).toBe(2);
  });

  it('rejects an asynchronous failure and frees its key for a later call', async () => {
    const failure = new Error('asynchronous failure');
    const receiver: Receiver = { prefix: 'api' };
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      calls += 1;
      return calls === 1 ? Promise.reject(failure) : Promise.resolve(`${this.prefix}:${id}`);
    };
    const operation = pipe(method, switchOverlap<Receiver, Args, string>({ key: () => 'account' }));

    await expect(operation.call(receiver, 'first')).rejects.toBe(failure);
    await expect(operation.call(receiver, 'second')).resolves.toBe('api:second');
    expect(calls).toBe(2);
  });

  it('uses an explicit run key without evaluating the fallback resolver', async () => {
    const first = deferred<string>();
    const latest = deferred<string>();
    const receiver: Receiver = { prefix: 'api' };
    const events: PolicyEvent[] = [];
    const eventSink: EventSink = {
      emit(event): void {
        events.push(event);
      },
    };
    let calls = 0;
    let resolverCalls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? first.promise : latest.promise;
    };
    const operation = pipe(
      method,
      switchOverlap<Receiver, Args, string>({
        key: () => {
          resolverCalls += 1;
          return 'resolver-key';
        },
      }),
    );

    const prior = run(receiver, ['first'] as const, operation, {
      eventSink,
      key: 'run-key',
      operationId: 'switch-prior',
    });
    const priorHandled = Promise.resolve(prior).then(
      () => undefined,
      (error: unknown) => error,
    );
    const replacement = run(receiver, ['latest'] as const, operation, {
      eventSink,
      key: 'run-key',
      operationId: 'switch-latest',
    });

    await expect(priorHandled).resolves.toBeInstanceOf(OverlapSupersededError);
    expect(resolverCalls).toBe(0);
    expect(calls).toBe(2);
    expect(events.slice(0, 2)).toEqual([
      expect.objectContaining({
        key: 'run-key',
        kind: 'overlap.started',
        operationId: 'switch-prior',
      }),
      expect.objectContaining({
        key: 'run-key',
        kind: 'overlap.started',
        operationId: 'switch-latest',
      }),
    ]);

    latest.resolve('latest-result');
    await expect(replacement).resolves.toBe('latest-result');
    first.resolve('prior-work-finished');
    await expect(first.promise).resolves.toBe('prior-work-finished');
  });

  it('marks a prior call for the same key obsolete and only resolves the latest call', async () => {
    const first = deferred<string>();
    const latest = deferred<string>();
    const starts: string[] = [];
    const receiver: Receiver = { prefix: 'api' };
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      return id === 'first' ? first.promise : latest.promise;
    };
    const operation = pipe(method, switchOverlap<Receiver, Args, string>({ key: () => 'account' }));

    const prior = operation.call(receiver, 'first');
    const priorHandled = Promise.resolve(prior).then(
      () => undefined,
      (error: unknown) => error,
    );
    const replacement = operation.call(receiver, 'latest');

    await expect(priorHandled).resolves.toBeInstanceOf(OverlapSupersededError);
    expect(starts).toEqual(['first', 'latest']);

    latest.resolve('latest-result');
    await expect(replacement).resolves.toBe('latest-result');

    first.resolve('prior-work-finished');
    await expect(first.promise).resolves.toBe('prior-work-finished');
  });

  it('does not obsolete work for independent keys', async () => {
    const firstAccount = deferred<string>();
    const secondAccount = deferred<string>();
    const otherAccount = deferred<string>();
    const starts: string[] = [];
    const receiver: Receiver = { prefix: 'api' };
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      switch (id) {
        case 'account-a:first':
          return firstAccount.promise;
        case 'account-a:second':
          return secondAccount.promise;
        default:
          return otherAccount.promise;
      }
    };
    const operation = pipe(
      method,
      switchOverlap<Receiver, Args, string>({
        key: ({ args }) => (args[0].startsWith('account-a') ? 'account-a' : 'account-b'),
      }),
    );

    const first = operation.call(receiver, 'account-a:first');
    const firstHandled = Promise.resolve(first).then(
      () => undefined,
      (error: unknown) => error,
    );
    const independent = operation.call(receiver, 'account-b:first');
    const replacement = operation.call(receiver, 'account-a:second');

    await expect(firstHandled).resolves.toBeInstanceOf(OverlapSupersededError);
    expect(starts).toEqual(['account-a:first', 'account-b:first', 'account-a:second']);

    otherAccount.resolve('independent-result');
    secondAccount.resolve('replacement-result');
    await expect(independent).resolves.toBe('independent-result');
    await expect(replacement).resolves.toBe('replacement-result');

    firstAccount.resolve('obsolete-work-finished');
    await expect(firstAccount.promise).resolves.toBe('obsolete-work-finished');
  });

  it('observes rejected obsolete work without clearing the newer active call', async () => {
    const obsolete = deferred<string>();
    const current = deferred<string>();
    const latest = deferred<string>();
    const obsoleteFailure = new Error('obsolete work failed');
    const starts: string[] = [];
    const receiver: Receiver = { prefix: 'api' };
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      starts.push(id);
      switch (id) {
        case 'obsolete':
          return obsolete.promise;
        case 'current':
          return current.promise;
        default:
          return latest.promise;
      }
    };
    const operation = pipe(method, switchOverlap<Receiver, Args, string>({ key: () => 'account' }));

    const obsoleteConsumer = operation.call(receiver, 'obsolete');
    const obsoleteConsumerHandled = Promise.resolve(obsoleteConsumer).then(
      () => undefined,
      (error: unknown) => error,
    );
    const currentConsumer = operation.call(receiver, 'current');
    const currentConsumerHandled = Promise.resolve(currentConsumer).then(
      () => undefined,
      (error: unknown) => error,
    );

    await expect(obsoleteConsumerHandled).resolves.toBeInstanceOf(OverlapSupersededError);

    const obsoleteWorkHandled = expect(obsolete.promise).rejects.toBe(obsoleteFailure);
    obsolete.reject(obsoleteFailure);
    await obsoleteWorkHandled;

    const latestConsumer = operation.call(receiver, 'latest');
    await expect(currentConsumerHandled).resolves.toBeInstanceOf(OverlapSupersededError);
    expect(starts).toEqual(['obsolete', 'current', 'latest']);

    latest.resolve('latest-result');
    await expect(latestConsumer).resolves.toBe('latest-result');

    current.resolve('current-work-finished');
    await expect(current.promise).resolves.toBe('current-work-finished');
  });
});
