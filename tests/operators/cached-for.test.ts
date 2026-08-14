import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedFor } from '../../src/operators/cached-for';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

describe('cachedFor operator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a cached value for a hit and invokes the method again for a miss', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const wrapped = cachedFor<Receiver, Args, string>(1_000).apply(method);

    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe('api:account:1');
    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe('api:account:1');
    expect(wrapped.call({ prefix: 'api' }, 'settings')).toBe('api:settings:2');
    expect(calls).toBe(2);
  });

  it('uses the configured key resolver to share equivalent arguments', () => {
    let calls = 0;
    type UserArgs = readonly [user: { readonly id: string; readonly name: string }];
    const method: AnyMethod<Receiver, UserArgs, number> = function (): number {
      calls += 1;
      return calls;
    };
    const wrapped = cachedFor<Receiver, UserArgs, number>(1_000, {
      key: (user) => user.id,
    }).apply(method);

    expect(wrapped.call({ prefix: 'api' }, { id: '7', name: 'Ada' })).toBe(1);
    expect(wrapped.call({ prefix: 'api' }, { id: '7', name: 'Grace' })).toBe(1);
    expect(calls).toBe(1);
  });

  it('expires entries relative to their invocation time', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, number> = function (): number {
      calls += 1;
      return calls;
    };
    const wrapped = cachedFor<Receiver, Args, number>(1_000).apply(method);

    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe(1);
    vi.advanceTimersByTime(999);
    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe(1);
    vi.advanceTimersByTime(1);
    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe(2);
  });

  it('shares an in-flight Promise for matching calls in one pipeline', async () => {
    let resolve!: (value: string) => void;
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return new Promise((done) => {
        resolve = done;
      });
    };
    const wrapped = cachedFor<Receiver, Args, string>(1_000).apply(method);

    const first = wrapped.call({ prefix: 'api' }, 'account');
    const second = wrapped.call({ prefix: 'api' }, 'account');

    expect(first).toBe(second);
    expect(calls).toBe(1);

    resolve('loaded');
    await expect(first).resolves.toBe('loaded');
  });

  it('keeps cache state isolated between pipelines', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, number> = function (): number {
      calls += 1;
      return calls;
    };
    const firstPipeline = cachedFor<Receiver, Args, number>(1_000).apply(method);
    const secondPipeline = cachedFor<Receiver, Args, number>(1_000).apply(method);
    const receiver = { prefix: 'api' };

    expect(firstPipeline.call(receiver, 'account')).toBe(1);
    expect(firstPipeline.call(receiver, 'account')).toBe(1);
    expect(secondPipeline.call(receiver, 'account')).toBe(2);
    expect(secondPipeline.call(receiver, 'account')).toBe(2);
  });

  it('evicts a rejected Promise so a later call can try again', async () => {
    const failure = new Error('unavailable');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? Promise.reject(failure) : Promise.resolve('recovered');
    };
    const wrapped = cachedFor<Receiver, Args, string>(1_000).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).rejects.toBe(failure);
    await expect(wrapped.call({ prefix: 'api' }, 'account')).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });

  it('keeps a replacement entry when an expired Promise later rejects', async () => {
    const failure = new Error('unavailable');
    let rejectFirst!: (reason: Error) => void;
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      }
      return Promise.resolve('fresh');
    };
    const wrapped = cachedFor<Receiver, Args, string>(1_000).apply(method);

    const expired = wrapped.call({ prefix: 'api' }, 'account');
    vi.advanceTimersByTime(1_000);
    const replacement = wrapped.call({ prefix: 'api' }, 'account');

    rejectFirst(failure);

    await expect(expired).rejects.toBe(failure);
    await expect(replacement).resolves.toBe('fresh');
    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe(replacement);
    expect(calls).toBe(2);
  });

  it('evicts an entry when reading its thenable getter throws', async () => {
    const failure = new Error('then getter failure');
    const rejectedThenable = Object.defineProperty({}, 'then', {
      get(): never {
        throw failure;
      },
    });
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      calls += 1;
      return calls === 1 ? (rejectedThenable as string) : 'recovered';
    };
    const wrapped = cachedFor<Receiver, Args, string>(1_000).apply(method);
    const receiver = { prefix: 'api' };

    const first = wrapped.call(receiver, 'account');
    await expect(Promise.resolve(first)).rejects.toBe(failure);

    expect(wrapped.call(receiver, 'account')).toBe('recovered');
    expect(calls).toBe(2);
  });
});
