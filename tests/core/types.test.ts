import { describe, expectTypeOf, it } from 'vitest';
import * as coreOperator from '../../src/core/operator';
import * as coreTypes from '../../src/core/types';
import type { Operator } from '../../src/core/operator';
import type { AnyMethod, MaybePromise, OperationContext } from '../../src/core/types';

interface Receiver {
  readonly offset: number;
}

type MethodArgs = readonly [id: string];

describe('core type contracts', () => {
  it('preserves receiver, arguments, and sync or async results', () => {
    void coreOperator;
    void coreTypes;

    const receiver: Receiver = { offset: 1 };

    const syncMethod: AnyMethod<Receiver, MethodArgs, number> = function (
      this: Receiver,
      id: string,
    ): number {
      return this.offset + id.length;
    };
    const promiseMethod: AnyMethod<Receiver, MethodArgs, number> = async function (
      this: Receiver,
      id: string,
    ): Promise<number> {
      return this.offset + id.length;
    };
    const thenableMethod: AnyMethod<Receiver, MethodArgs, number> = function (
      this: Receiver,
      id: string,
    ): PromiseLike<number> {
      return Promise.resolve(this.offset + id.length);
    };

    expectTypeOf(syncMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
    expectTypeOf(promiseMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
    expectTypeOf(thenableMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
  });

  it('keeps the operation context readonly and composes compatible operators', () => {
    const context: OperationContext<Receiver, MethodArgs> = {
      receiver: { offset: 1 },
      args: ['account'],
      key: 'load',
    };
    const method: AnyMethod<Receiver, MethodArgs, number> = function (
      this: Receiver,
      id: string,
    ): number {
      return this.offset + id.length;
    };
    const operator: Operator<Receiver, MethodArgs, number, number> = {
      name: 'increment-result',
      apply(next) {
        return function (this: Receiver, id: string): MaybePromise<number> {
          const result = next.call(this, id);
          return typeof result === 'number' ? result + 1 : result.then((value) => value + 1);
        };
      },
    };

    const wrapped = operator.apply(method);

    expectTypeOf(context.receiver).toEqualTypeOf<Receiver>();
    expectTypeOf(context.args).toEqualTypeOf<MethodArgs>();
    expectTypeOf(wrapped).toEqualTypeOf<AnyMethod<Receiver, MethodArgs, number>>();

    // @ts-expect-error OperationContext must not expose mutable arguments.
    context.args[0] = 'other';
    // @ts-expect-error The operator must preserve the string argument contract.
    operator.apply(function (this: Receiver, id: number): number {
      return this.offset + id;
    });
  });
});
