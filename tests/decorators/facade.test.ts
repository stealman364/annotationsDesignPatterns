import { describe, expect, it } from 'vitest';
import { adaptOperator } from '../../src/decorators/adapters';
import {
  CachedFor as FacadeCachedFor,
  CircuitBreaker as FacadeCircuitBreaker,
  Fallback as FacadeFallback,
  Memoize as FacadeMemoize,
  Retry as FacadeRetry,
  Timeout as FacadeTimeout,
} from '../../src/decorators';
import type { Operator } from '../../src/core/operator';
import type { AnyMethod, MaybePromise } from '../../src/core/types';
import { CachedFor } from '../../src/patterns/utility/cached-for';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';
import { Fallback } from '../../src/patterns/utility/fallback';
import { Memoize } from '../../src/patterns/utility/memoize';
import { Retry } from '../../src/patterns/utility/retry';
import { Timeout } from '../../src/patterns/utility/timeout';
import * as root from '../../src/index';

function methodContext<This, Args extends readonly unknown[], Result>(
  name: string,
  target: AnyMethod<This, Args, Result>,
): ClassMethodDecoratorContext<This, AnyMethod<This, Args, Result>> {
  return {
    kind: 'method',
    name,
    static: false,
    private: false,
    access: {
      has: () => true,
      get: () => target,
    },
    addInitializer: () => undefined,
    metadata: undefined,
  };
}

function passthroughOperator<This, Args extends readonly unknown[], Result>(): Operator<
  This,
  Args,
  Result,
  Result
> {
  return {
    name: 'passthrough',
    apply(next) {
      return next;
    },
  };
}

describe('adaptOperator', () => {
  it('preserves the receiver, arguments, and synchronous result', () => {
    interface Receiver {
      readonly prefix: string;
    }

    const receiver = { prefix: 'item' };
    let receivedExpectedReceiver = false;
    let observedValue: number | undefined;
    const target: AnyMethod<Receiver, readonly [number], string> = function (this, value) {
      return `${this.prefix}:${value}`;
    };
    const decorator = adaptOperator<Receiver, readonly [number], string>(() => ({
      name: 'suffix',
      apply(next) {
        return function (this: Receiver, value: number): MaybePromise<string> {
          receivedExpectedReceiver = this === receiver;
          observedValue = value;
          return next.call(this, value);
        };
      },
    }));

    const decorated = decorator(target, methodContext('load', target));

    expect(decorated.call(receiver, 7)).toBe('item:7');
    expect(receivedExpectedReceiver).toBe(true);
    expect(observedValue).toBe(7);
  });

  it('preserves the exact error thrown by the decorated method', () => {
    interface Receiver {
      readonly id: string;
    }

    const failure = new Error('upstream failure');
    const target: AnyMethod<Receiver, readonly [], never> = function (): never {
      throw failure;
    };
    const decorator = adaptOperator<Receiver, readonly [], never>(() => passthroughOperator());
    const decorated = decorator(target, methodContext('load', target));

    let caught: unknown;
    try {
      decorated.call({ id: 'api' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
  });

  it.each(['field', 'getter', 'setter'] as const)(
    'rejects a %s context with a clear method-only error',
    (kind) => {
      interface Receiver {
        readonly id: string;
      }

      const target: AnyMethod<Receiver, readonly [], string> = function (): string {
        return this.id;
      };
      const decorator = adaptOperator<Receiver, readonly [], string>(() => passthroughOperator());
      const invalidContext = { kind, name: 'load' };

      expect(() =>
        decorator(
          target,
          invalidContext as unknown as ClassMethodDecoratorContext<
            Receiver,
            AnyMethod<Receiver, readonly [], string>
          >,
        ),
      ).toThrow(TypeError);
      expect(() =>
        decorator(
          target,
          invalidContext as unknown as ClassMethodDecoratorContext<
            Receiver,
            AnyMethod<Receiver, readonly [], string>
          >,
        ),
      ).toThrow(/m[eé]todo|method/i);
    },
  );

  it('creates stateful operator pipelines independently for each receiver', () => {
    interface Receiver {
      readonly base: number;
    }

    let created = 0;
    const callsPerPipeline: number[] = [];
    const target: AnyMethod<Receiver, readonly [], number> = function (): number {
      return this.base;
    };
    const decorator = adaptOperator<Receiver, readonly [], number>(
      () => {
        created += 1;
        let calls = 0;
        return {
          name: 'per-instance-counter',
          apply(next) {
            return function (this: Receiver): MaybePromise<number> {
              calls += 1;
              callsPerPipeline.push(calls);
              return next.call(this);
            };
          },
        };
      },
      { scope: 'instance' },
    );
    const decorated = decorator(target, methodContext('next', target));
    const first = { base: 10 };
    const second = { base: 20 };

    expect(decorated.call(first)).toBe(10);
    expect(decorated.call(first)).toBe(10);
    expect(decorated.call(second)).toBe(20);
    expect(created).toBe(2);
    expect(callsPerPipeline).toEqual([1, 2, 1]);
  });
});

describe('decorators facade', () => {
  it('reexports every policy decorator from its existing implementation', () => {
    expect(FacadeFallback).toBe(Fallback);
    expect(FacadeTimeout).toBe(Timeout);
    expect(FacadeRetry).toBe(Retry);
    expect(FacadeCircuitBreaker).toBe(CircuitBreaker);
    expect(FacadeMemoize).toBe(Memoize);
    expect(FacadeCachedFor).toBe(CachedFor);
  });

  it('keeps the root exports aligned with the decorators facade', () => {
    expect(root.Fallback).toBe(FacadeFallback);
    expect(root.Timeout).toBe(FacadeTimeout);
    expect(root.Retry).toBe(FacadeRetry);
    expect(root.CircuitBreaker).toBe(FacadeCircuitBreaker);
    expect(root.Memoize).toBe(FacadeMemoize);
    expect(root.CachedFor).toBe(FacadeCachedFor);
  });
});
