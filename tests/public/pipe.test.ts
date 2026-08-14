import { describe, expect, expectTypeOf, it } from 'vitest';
import { pipe } from '../../src/public/pipe';
import type { AnyMethod, MaybePromise, Operator } from '../../src/public/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [value: string, count: number];

function recordingOperator(
  name: string,
  calls: string[],
): Operator<Receiver, Args, string, string> {
  return {
    name,
    apply(next) {
      return function (this: Receiver, value: string, count: number): MaybePromise<string> {
        calls.push(`${name}:before`);
        const result = next.call(this, value, count);
        calls.push(`${name}:after`);
        return result;
      };
    },
  };
}

describe('pipe', () => {
  it('applies operators left-to-right while preserving receiver, arguments, and return', () => {
    const calls: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      value: string,
      count: number,
    ): string {
      calls.push(`method:${this.prefix}:${value}:${count}`);
      return `${this.prefix}:${value}:${count}`;
    };

    const piped = pipe(
      method,
      recordingOperator('outer', calls),
      recordingOperator('inner', calls),
    );

    expect(piped.call({ prefix: 'receiver' }, 'argument', 2)).toBe('receiver:argument:2');
    expect(calls).toEqual([
      'outer:before',
      'inner:before',
      'method:receiver:argument:2',
      'inner:after',
      'outer:after',
    ]);
    expectTypeOf(piped).toEqualTypeOf<AnyMethod<Receiver, Args, string>>();
  });

  it('propagates the original synchronous error through the pipeline', () => {
    const calls: string[] = [];
    const failure = new Error('expected failure');
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      calls.push('method');
      throw failure;
    };

    const piped = pipe(
      method,
      recordingOperator('outer', calls),
      recordingOperator('inner', calls),
    );

    expect(() => piped.call({ prefix: 'receiver' }, 'argument', 2)).toThrow(failure);
    expect(calls).toEqual(['outer:before', 'inner:before', 'method']);
  });

  it('rejects operators with incompatible argument or result contracts', () => {
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      value: string,
      count: number,
    ): string {
      return `${this.prefix}:${value}:${count}`;
    };
    const incompatibleArguments: Operator<Receiver, readonly [value: number], string, string> = {
      name: 'wrong-arguments',
      apply(next) {
        return function (this: Receiver, value: number): MaybePromise<string> {
          return next.call(this, value);
        };
      },
    };
    const incompatibleResult: Operator<Receiver, Args, number, number> = {
      name: 'wrong-result',
      apply(next) {
        return function (this: Receiver, value: string, count: number): MaybePromise<number> {
          return next.call(this, value, count);
        };
      },
    };

    // @ts-expect-error A pipeline must preserve its argument tuple.
    pipe<Receiver, Args, string>(method, incompatibleArguments);
    // @ts-expect-error A homogeneous pipeline must preserve its result type.
    pipe<Receiver, Args, string>(method, incompatibleResult);
  });
});
