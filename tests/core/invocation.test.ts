import { describe, expect, it } from 'vitest';
import { invoke } from '../../src/core/invocation';

interface Receiver {
  readonly prefix: string;
}

class Thenable<Value> implements PromiseLike<Value> {
  constructor(private readonly value: Value) {}

  then<TResult1 = Value, TResult2 = never>(
    onfulfilled?: ((value: Value) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}

describe('invoke', () => {
  it('preserves the receiver, argument order, and a synchronous result', () => {
    const receiver: Receiver = { prefix: 'result' };

    const result = invoke(
      receiver,
      ['first', 2] as const,
      function (this: Receiver, first: string, second: number): string {
        return `${this.prefix}:${first}:${second}`;
      },
    );

    expect(result).toBe('result:first:2');
  });

  it('preserves Promise results without awaiting them', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = Promise.resolve('result:promise');

    const result = invoke(receiver, [] as const, function (this: Receiver): Promise<string> {
      void this;
      return expected;
    });

    expect(result).toBe(expected);
  });

  it('preserves structural thenable results without normalizing them', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = new Thenable('result:thenable');

    const result = invoke(receiver, [] as const, function (): PromiseLike<string> {
      return expected;
    });

    expect(result).toBe(expected);
  });

  it('propagates the original synchronous error', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = new Error('original failure');

    expect(() =>
      invoke(receiver, [] as const, function (): never {
        throw expected;
      }),
    ).toThrow(expected);
  });
});
