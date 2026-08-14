import { describe, expect, it } from 'vitest';
import { memoize } from '../../src/operators/memoize';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

describe('memoize operator', () => {
  it('returns cached synchronous results for repeated arguments in one pipeline', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const wrapped = memoize<Receiver, Args, string>().apply(method);
    const receiver = { prefix: 'api' };

    expect(wrapped.call(receiver, 'account')).toBe('api:account:1');
    expect(wrapped.call(receiver, 'account')).toBe('api:account:1');
    expect(wrapped.call(receiver, 'profile')).toBe('api:profile:2');
    expect(calls).toBe(2);
  });

  it('uses the supplied key resolver to identify equivalent calls', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const wrapped = memoize<Receiver, Args, string>({
      key: (id) => id.toLowerCase(),
    }).apply(method);
    const receiver = { prefix: 'api' };

    expect(wrapped.call(receiver, 'ACCOUNT')).toBe('api:ACCOUNT:1');
    expect(wrapped.call(receiver, 'account')).toBe('api:ACCOUNT:1');
    expect(calls).toBe(1);
  });

  it('shares one pending Promise between equivalent calls', async () => {
    let calls = 0;
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((currentResolve) => {
      resolve = currentResolve;
    });
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return pending;
    };
    const wrapped = memoize<Receiver, Args, string>().apply(method);
    const receiver = { prefix: 'api' };

    const first = wrapped.call(receiver, 'account');
    const second = wrapped.call(receiver, 'account');

    expect(second).toBe(first);
    expect(calls).toBe(1);

    resolve('complete');
    await expect(first).resolves.toBe('complete');
  });

  it('evicts a rejected Promise so a later call replaces its cached identity', async () => {
    const failure = new Error('temporary failure');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? Promise.reject(failure) : Promise.resolve('recovered');
    };
    const wrapped = memoize<Receiver, Args, string>().apply(method);
    const receiver = { prefix: 'api' };

    const rejected = wrapped.call(receiver, 'account');

    await expect(rejected).rejects.toBe(failure);

    const replacement = wrapped.call(receiver, 'account');

    expect(replacement).not.toBe(rejected);
    await expect(replacement).resolves.toBe('recovered');
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
    const wrapped = memoize<Receiver, Args, string>().apply(method);
    const receiver = { prefix: 'api' };

    const first = wrapped.call(receiver, 'account');
    await expect(Promise.resolve(first)).rejects.toBe(failure);

    expect(wrapped.call(receiver, 'account')).toBe('recovered');
    expect(calls).toBe(2);
  });
});
