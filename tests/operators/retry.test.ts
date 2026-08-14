import { afterEach, describe, expect, it, vi } from 'vitest';
import { retry } from '../../src/operators/retry';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

describe('retry operator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial successful result without retrying', () => {
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      attempts += 1;
      return `${this.prefix}:${id}`;
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 3 }).apply(method);

    expect(wrapped.call({ prefix: 'api' }, 'account')).toBe('api:account');
    expect(attempts).toBe(1);
  });

  it('recovers from a synchronous throw on a later attempt', async () => {
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('temporary failure');
      }
      return 'recovered';
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 2 }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('recovers from a rejected Promise on a later attempt', async () => {
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('temporary failure'))
        : Promise.resolve('recovered');
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 2 }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('preserves the last error after attempts are exhausted', async () => {
    const firstFailure = new Error('first failure');
    const lastFailure = { kind: 'last failure' };
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      attempts += 1;
      throw attempts === 1 ? firstFailure : lastFailure;
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 2 }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).rejects.toBe(lastFailure);
    expect(attempts).toBe(2);
  });

  it('waits with exponential backoff between retries', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const timeline: number[] = [];
    const start = Date.now();
    const lastFailure = new Error('last failure');
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      attempts += 1;
      timeline.push(Date.now() - start);
      throw lastFailure;
    };
    const wrapped = retry<Receiver, Args, string>({
      attempts: 3,
      delayMs: 100,
      backoffFactor: 2,
    }).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');
    const assertion = expect(result).rejects.toBe(lastFailure);

    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await assertion;
    expect(attempts).toBe(3);
    expect(timeline).toEqual([0, 100, 300]);
  });

  it('retries structural thenable rejections', async () => {
    const failure = new Error('thenable failure');
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): PromiseLike<string> {
      attempts += 1;
      return attempts === 1
        ? {
            then(_onfulfilled, onrejected) {
              return Promise.reject(failure).then(_onfulfilled, onrejected);
            },
          }
        : {
            then(onfulfilled, onrejected) {
              return Promise.resolve('recovered thenable').then(onfulfilled, onrejected);
            },
          };
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 2 }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).resolves.toBe('recovered thenable');
    expect(attempts).toBe(2);
  });

  it('retries when reading a thenable getter throws', async () => {
    const failure = new Error('then getter failure');
    let attempts = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      attempts += 1;
      return attempts === 1
        ? (Object.defineProperty({}, 'then', {
            get(): never {
              throw failure;
            },
          }) as string)
        : 'recovered';
    };
    const wrapped = retry<Receiver, Args, string>({ attempts: 2 }).apply(method);

    await expect(wrapped.call({ prefix: 'api' }, 'account')).resolves.toBe('recovered');
    expect(attempts).toBe(2);
  });
});
