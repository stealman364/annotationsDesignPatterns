import type { Operator } from '../core/operator';
import type { AnyMethod } from '../core/types';

export type DecoratorOperatorScope = 'shared' | 'instance';

export interface AdaptOperatorOptions {
  readonly scope?: DecoratorOperatorScope;
  readonly decoratorName?: string;
}

export type DecoratorOperatorFactory<
  This extends object,
  Args extends readonly unknown[],
  Result,
> = (
  context: ClassMethodDecoratorContext<This, AnyMethod<This, Args, Result>>,
) => Operator<This, Args, Result, Result>;

type AdaptedMethodDecorator<This extends object, Args extends readonly unknown[], Result> = <
  Method extends AnyMethod<This, Args, Result>,
>(
  target: Method,
  context: ClassMethodDecoratorContext<This, Method>,
) => Method;

/**
 * Adapts one internal operator to a TC39 method decorator.
 *
 * Stateful operators can use `scope: 'instance'` to retain the existing
 * decorator contract: each receiver owns an independent operator pipeline.
 */
export function adaptOperator<This extends object, Args extends readonly unknown[], Result>(
  createOperator: DecoratorOperatorFactory<This, Args, Result>,
  { scope = 'shared', decoratorName = 'El decorador' }: AdaptOperatorOptions = {},
): AdaptedMethodDecorator<This, Args, Result> {
  return (target, context) => {
    if (context.kind !== 'method') {
      throw new TypeError(`${decoratorName} solo puede aplicarse a un método`);
    }

    if (scope === 'shared') {
      return createOperator(
        context as unknown as ClassMethodDecoratorContext<This, AnyMethod<This, Args, Result>>,
      ).apply(target) as typeof target;
    }

    const wrappers = new WeakMap<This, AnyMethod<This, Args, Result>>();
    return function (this: This, ...args: Args) {
      let wrapped = wrappers.get(this);
      if (!wrapped) {
        wrapped = createOperator(
          context as unknown as ClassMethodDecoratorContext<This, AnyMethod<This, Args, Result>>,
        ).apply(target);
        wrappers.set(this, wrapped);
      }
      return wrapped.call(this, ...args);
    } as typeof target;
  };
}
