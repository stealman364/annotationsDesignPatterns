import { describe, expect, it } from 'vitest';
import { composeOperators } from '../../src/operators/compose';
import type { Operator } from '../../src/core/operator';
import type { AnyMethod, MaybePromise } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [value: string];

function recordingOperator(
  name: string,
  calls: string[],
): Operator<Receiver, Args, string, string> {
  return {
    name,
    apply(next) {
      return function (this: Receiver, value: string): MaybePromise<string> {
        calls.push(`${name}:before`);
        const result = next.call(this, value);
        calls.push(`${name}:after`);
        return result;
      };
    },
  };
}

describe('composeOperators', () => {
  it('applies operators left-to-right while preserving receiver and arguments', () => {
    const calls: string[] = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      value: string,
    ): string {
      calls.push(`method:${this.prefix}:${value}`);
      return `${this.prefix}:${value}`;
    };
    const outer = recordingOperator('outer', calls);
    const inner = recordingOperator('inner', calls);

    const composed = composeOperators(method, outer, inner);

    expect(composed.call({ prefix: 'receiver' }, 'argument')).toBe('receiver:argument');
    expect(calls).toEqual([
      'outer:before',
      'inner:before',
      'method:receiver:argument',
      'inner:after',
      'outer:after',
    ]);
  });

  it('does not mutate the operator list supplied by the caller', () => {
    const calls: string[] = [];
    const operators = Object.freeze([
      recordingOperator('outer', calls),
      recordingOperator('inner', calls),
    ]);
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      value: string,
    ): string {
      return `${this.prefix}:${value}`;
    };

    const composed = composeOperators(method, ...operators);

    expect(composed.call({ prefix: 'receiver' }, 'argument')).toBe('receiver:argument');
    expect(operators.map((operator) => operator.name)).toEqual(['outer', 'inner']);
  });
});
