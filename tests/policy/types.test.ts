import { describe, expectTypeOf, it } from 'vitest';
import { definePolicy } from '../../src/policy/define-policy';
import type { Operator } from '../../src/core/operator';
import type { AnyMethod, MaybePromise } from '../../src/core/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

describe('definePolicy type contract', () => {
  it('preserves receiver, argument tuple, and awaited result through its operator', () => {
    const policy = definePolicy<Receiver, Args, string>({
      fallback: { value: 'recovered' },
      retry: { attempts: 2, idempotent: true },
    });
    const method: AnyMethod<Receiver, Args, string> = async function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      return `${this.prefix}:${id}`;
    };
    const wrapped = policy.operator().apply(method);

    expectTypeOf(policy.operator()).toEqualTypeOf<Operator<Receiver, Args, string, string>>();
    expectTypeOf(wrapped).toEqualTypeOf<AnyMethod<Receiver, Args, string>>();
    expectTypeOf<Awaited<ReturnType<typeof wrapped>>>().toEqualTypeOf<string>();
    expectTypeOf(wrapped.call({ prefix: 'api' }, 'account')).toEqualTypeOf<MaybePromise<string>>();
  });

  it('does not make the resulting operator assignable to a different argument tuple', () => {
    const operator = definePolicy<Receiver, Args, string>({
      retry: { attempts: 1, idempotent: true },
    }).operator();

    expectTypeOf(operator).not.toMatchTypeOf<
      Operator<Receiver, readonly [id: number], string, string>
    >();
  });
});
