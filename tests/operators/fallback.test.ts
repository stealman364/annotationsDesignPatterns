import { describe, expect, it } from 'vitest';
import { fallback } from '../../src/operators/fallback';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: number];

describe('fallback operator', () => {
  it('returns a fixed fallback after a synchronous throw', () => {
    const failure = new Error('unavailable');
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      throw failure;
    };

    const wrapped = fallback<Receiver, Args, string>('recovered').apply(method);

    expect(wrapped.call({ prefix: 'api' }, 7)).toBe('recovered');
  });

  it('passes the original error and arguments to a fallback provider', () => {
    const failure = new Error('unavailable');
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      throw failure;
    };

    const wrapped = fallback<Receiver, Args, string>((error, id) => {
      expect(error).toBe(failure);
      return `${id}:recovered`;
    }).apply(method);

    expect(wrapped.call({ prefix: 'api' }, 7)).toBe('7:recovered');
  });

  it('awaits an asynchronous fallback provider after a rejection', async () => {
    const failure = new Error('unavailable');
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      return Promise.reject(failure);
    };
    const wrapped = fallback<Receiver, Args, string>(async (error, id) => {
      expect(error).toBe(failure);
      return `${id}:recovered`;
    }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 7)).resolves.toBe('7:recovered');
  });

  it('preserves a synchronous successful result by identity', () => {
    const result = { value: 'success' };
    const method: AnyMethod<Receiver, Args, typeof result> = function (): typeof result {
      return result;
    };
    const wrapped = fallback<Receiver, Args, typeof result>({ value: 'fallback' }).apply(method);

    expect(wrapped.call({ prefix: 'api' }, 7)).toBe(result);
  });

  it('handles a thenable rejection without treating a successful thenable as a failure', async () => {
    const failure = new Error('unavailable');
    const rejectedThenable: PromiseLike<string> = {
      then(_onfulfilled, onrejected) {
        return Promise.reject(failure).then(_onfulfilled, onrejected);
      },
    };
    const method: AnyMethod<Receiver, Args, string> = function (): PromiseLike<string> {
      return rejectedThenable;
    };
    const wrapped = fallback<Receiver, Args, string>('recovered').apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 7)).resolves.toBe('recovered');
  });

  it('uses the fallback when reading a thenable getter throws', async () => {
    const failure = new Error('then getter failure');
    const result = Object.defineProperty({}, 'then', {
      get(): never {
        throw failure;
      },
    });
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      return result as string;
    };
    const wrapped = fallback<Receiver, Args, string>('recovered').apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 7)).resolves.toBe('recovered');
  });
});
