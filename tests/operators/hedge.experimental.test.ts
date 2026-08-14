import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyMethod } from '../../src/core/types';
import { hedge } from '../../src/experimental/hedge';
import { pipe } from '../../src/public/pipe';

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

describe('hedge experimental operator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves a synchronous result without scheduling a hedge', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}`;
    };
    const operation = hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }).apply(
      method,
    );

    expect(operation.call({ prefix: 'api' }, 'account')).toBe('api:account');
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves a valid synchronous undefined result without scheduling a hedge', () => {
    let calls = 0;
    const operation = hedge<Receiver, Args, undefined>({ delayMs: 10, idempotent: true }).apply(
      function (): undefined {
        calls += 1;
        return undefined;
      },
    );

    expect(operation.call({ prefix: 'api' }, 'account')).toBeUndefined();
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a delayed hedge after a synchronous primary exception and returns its success', async () => {
    const primaryFailure = new Error('primary failed synchronously');
    let calls = 0;
    const operation = hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }).apply(
      function (): Promise<string> {
        calls += 1;
        if (calls === 1) {
          throw primaryFailure;
        }
        return Promise.resolve('hedge-recovered');
      },
    );

    const result = operation.call({ prefix: 'api' }, 'account');

    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(9);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBe('hedge-recovered');
    expect(calls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the delayed hedge failure deterministically after a synchronous primary exception', async () => {
    const primaryFailure = new Error('primary failed synchronously');
    const hedgeFailure = new Error('hedge failed synchronously');
    let calls = 0;
    const operation = hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }).apply(
      function (): string {
        calls += 1;
        throw calls === 1 ? primaryFailure : hedgeFailure;
      },
    );

    const result = operation.call({ prefix: 'api' }, 'account');
    const rejection = expect(result).rejects.toBe(hedgeFailure);

    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    expect(calls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start a second execution before its delay and removes that timer when primary wins early', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    };
    const operation = pipe(
      method,
      hedge<Receiver, Args, string>({ delayMs: 25, idempotent: true }),
    );
    const receiver = { prefix: 'api' };

    const result = operation.call(receiver, 'account');

    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(24);
    expect(calls).toBe(1);

    first.resolve('primary');
    await expect(result).resolves.toBe('primary');
    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns the first successful completion after hedging, while the losing execution may finish later', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? first.promise : second.promise;
    };
    const operation = pipe(
      method,
      hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }),
    );
    const receiver = { prefix: 'api' };

    const result = operation.call(receiver, 'account');
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toBe(2);

    second.resolve('hedge-winner');
    await expect(result).resolves.toBe('hedge-winner');

    first.resolve('primary-late');
    await expect(first.promise).resolves.toBe('primary-late');
    expect(calls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects deterministically after both executions fail without leaving a timer or unobserved rejection', async () => {
    const primary = deferred<string>();
    const duplicate = deferred<string>();
    const primaryFailure = new Error('primary failed');
    const hedgeFailure = new Error('hedge failed');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? primary.promise : duplicate.promise;
    };
    const operation = pipe(
      method,
      hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }),
    );

    const result = operation.call({ prefix: 'api' }, 'account');
    const rejection = expect(result).rejects.toBe(hedgeFailure);
    await vi.advanceTimersByTimeAsync(10);

    primary.reject(primaryFailure);
    await Promise.resolve();
    duplicate.reject(hedgeFailure);

    await rejection;
    expect(calls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses a synchronous hedge exception after a primary rejection', async () => {
    const primary = deferred<string>();
    const primaryFailure = new Error('primary failed');
    const hedgeFailure = new Error('hedge threw');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        return primary.promise;
      }
      throw hedgeFailure;
    };
    const operation = pipe(
      method,
      hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }),
    );

    const result = operation.call({ prefix: 'api' }, 'account');
    const rejection = expect(result).rejects.toBe(hedgeFailure);
    const primaryWorkHandled = expect(primary.promise).rejects.toBe(primaryFailure);
    primary.reject(primaryFailure);
    await primaryWorkHandled;
    await vi.advanceTimersByTimeAsync(10);

    await rejection;
    expect(calls).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never starts more than a primary and one hedge execution', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        return first.promise;
      }
      if (calls === 2) {
        return second.promise;
      }
      throw new Error('a third hedge must not be started');
    };
    const operation = pipe(
      method,
      hedge<Receiver, Args, string>({ delayMs: 10, idempotent: true }),
    );
    const receiver = { prefix: 'api' };

    const result = operation.call(receiver, 'account');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(calls).toBe(2);

    second.resolve('hedge-winner');
    await expect(result).resolves.toBe('hedge-winner');
    first.resolve('primary-late');
    await expect(first.promise).resolves.toBe('primary-late');
    expect(calls).toBe(2);
  });

  it('rejects hedge configuration that does not explicitly declare idempotency', () => {
    const unsafeOptions = { delayMs: 10 } as unknown as {
      readonly delayMs: number;
      readonly idempotent: true;
    };

    expect(() => hedge<Receiver, Args, string>(unsafeOptions)).toThrow(TypeError);
  });

  it('rejects non-finite and negative hedge delays', () => {
    for (const delayMs of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      expect(() => hedge<Receiver, Args, string>({ delayMs, idempotent: true })).toThrow(
        RangeError,
      );
    }
  });
});
