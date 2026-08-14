import { describe, expectTypeOf, it } from 'vitest';
import * as publicTypes from '../../src/public/types';
import type { AnyMethod, MaybePromise, OperationContext, Operator } from '../../src/public/types';

interface Receiver {
  readonly offset: number;
}

type LookupArgs = readonly [id: string];
type UpdateArgs = readonly [id: string, enabled: boolean];

describe('public type contracts', () => {
  it('declares sync, async, and thenable methods without internal imports', () => {
    void publicTypes;

    const receiver: Receiver = { offset: 1 };
    const syncMethod: AnyMethod<Receiver, LookupArgs, number> = function (
      this: Receiver,
      id: string,
    ): number {
      return this.offset + id.length;
    };
    const asyncMethod: AnyMethod<Receiver, LookupArgs, number> = async function (
      this: Receiver,
      id: string,
    ): Promise<number> {
      return this.offset + id.length;
    };
    const thenableMethod: AnyMethod<Receiver, LookupArgs, number> = function (
      this: Receiver,
      id: string,
    ): PromiseLike<number> {
      return Promise.resolve(this.offset + id.length);
    };

    expectTypeOf(syncMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
    expectTypeOf(asyncMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
    expectTypeOf(thenableMethod.call(receiver, 'a')).toEqualTypeOf<MaybePromise<number>>();
  });

  it('preserves an explicit receiver and distinct argument arities for pipelines', () => {
    const context: OperationContext<Receiver, UpdateArgs> = {
      receiver: { offset: 1 },
      args: ['account', true],
      key: 'update',
    };
    const method: AnyMethod<Receiver, UpdateArgs, string> = function (
      this: Receiver,
      id: string,
      enabled: boolean,
    ): string {
      return `${this.offset}:${id}:${enabled}`;
    };
    const operator: Operator<Receiver, UpdateArgs, string, string> = {
      name: 'identity',
      apply(next) {
        return function (this: Receiver, id: string, enabled: boolean): MaybePromise<string> {
          return next.call(this, id, enabled);
        };
      },
    };

    const wrapped = operator.apply(method);

    expectTypeOf(context.receiver).toEqualTypeOf<Receiver>();
    expectTypeOf(context.args).toEqualTypeOf<UpdateArgs>();
    expectTypeOf(wrapped).toEqualTypeOf<AnyMethod<Receiver, UpdateArgs, string>>();

    // @ts-expect-error OperationContext must not expose mutable arguments.
    context.args[0] = 'other';
    // @ts-expect-error The pipeline must preserve the string identifier argument.
    operator.apply(function (this: Receiver, id: number, enabled: boolean): string {
      return `${this.offset}:${id}:${enabled}`;
    });
  });
});
