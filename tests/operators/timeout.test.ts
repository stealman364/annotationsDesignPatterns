import { afterEach, describe, expect, it, vi } from 'vitest';
import { timeout, TimeoutError } from '../../src/operators/timeout';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('timeout operator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when the operation finishes before the limit and clears its timer', async () => {
    vi.useFakeTimers();
    const method: AnyMethod<Receiver, Args, string> = async function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      await wait(50);
      return `${this.prefix}:${id}`;
    };
    const wrapped = timeout<Receiver, Args, string>(100).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');

    await vi.advanceTimersByTimeAsync(50);

    await expect(result).resolves.toBe('api:account');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with an identifiable timeout error when the limit expires', async () => {
    vi.useFakeTimers();
    const method: AnyMethod<Receiver, Args, string> = async function (): Promise<string> {
      await wait(200);
      return 'too late';
    };
    const wrapped = timeout<Receiver, Args, string>(100).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears its timer when the operation rejects before the limit', async () => {
    vi.useFakeTimers();
    const failure = new Error('upstream failure');
    const method: AnyMethod<Receiver, Args, string> = async function (): Promise<string> {
      await wait(50);
      throw failure;
    };
    const wrapped = timeout<Receiver, Args, string>(100).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');
    const assertion = expect(result).rejects.toBe(failure);

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears its timer when the operation throws synchronously', async () => {
    vi.useFakeTimers();
    const failure = new Error('upstream failure');
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      throw failure;
    };
    const wrapped = timeout<Receiver, Args, string>(100).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');

    await expect(result).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not cancel work that completes after the visible timeout', async () => {
    vi.useFakeTimers();
    let completed = false;
    const method: AnyMethod<Receiver, Args, string> = async function (): Promise<string> {
      await wait(200);
      completed = true;
      return 'completed late';
    };
    const wrapped = timeout<Receiver, Args, string>(100).apply(method);

    const result = wrapped.call({ prefix: 'api' }, 'account');
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(completed).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(100);

    expect(completed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
