import { describe, expect, expectTypeOf, it } from 'vitest';
import { run } from '../../src/public/run';
import type { AnyMethod, MaybePromise } from '../../src/public/types';

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

describe('run', () => {
  it('preserves the receiver, argument order, and a synchronous result', () => {
    const receiver: Receiver = { prefix: 'result' };

    const result = run(
      receiver,
      ['first', 2] as const,
      function (this: Receiver, first: string, second: number): string {
        return `${this.prefix}:${first}:${second}`;
      },
    );

    expect(result).toBe('result:first:2');
    expectTypeOf(result).toEqualTypeOf<MaybePromise<string>>();
  });

  it('preserves a Promise result without awaiting or normalizing it', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = Promise.resolve('result:promise');

    const result = run(receiver, [] as const, function (this: Receiver): Promise<string> {
      void this;
      return expected;
    });

    expect(result).toBe(expected);
  });

  it('preserves a structural thenable result without normalizing it', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = new Thenable('result:thenable');

    const result = run(receiver, [] as const, function (): PromiseLike<string> {
      return expected;
    });

    expect(result).toBe(expected);
  });

  it('propagates the original synchronous error', () => {
    const receiver: Receiver = { prefix: 'result' };
    const expected = new Error('original failure');

    expect(() =>
      run(receiver, [] as const, function (): never {
        throw expected;
      }),
    ).toThrow(expected);
  });

  it('rejects a method whose argument contract differs from the supplied tuple', () => {
    const receiver: Receiver = { prefix: 'result' };
    const method: AnyMethod<Receiver, readonly [value: number], string> = function (
      this: Receiver,
      value: number,
    ): string {
      return `${this.prefix}:${value}`;
    };

    // @ts-expect-error run must preserve the method argument tuple.
    run<Receiver, readonly [value: string], string>(receiver, ['value'] as const, method);
  });
});
