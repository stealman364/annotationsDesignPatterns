import { describe, expect, expectTypeOf, it } from 'vitest';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';
import { CircuitBreakerOpenError } from '../../src/operators/circuit-breaker';
import { Memoize } from '../../src/patterns/utility/memoize';
import { Retry } from '../../src/patterns/utility/retry';

function methodContext<This extends object, Args extends unknown[], Result>(
  name: string,
  target: (this: This, ...args: Args) => Result,
): ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result> {
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

function attemptMutation(mutate: () => void): void {
  try {
    mutate();
  } catch {
    // A factory may defensively freeze the caller's object instead of copying it.
  }
}

describe('snapshot de opciones de decoradores', () => {
  it('Retry conserva las opciones validadas al aplicarse después de una mutación inválida', async () => {
    const options = { attempts: 2 };
    const decorator = Retry(options);
    attemptMutation(() => {
      options.attempts = 0;
    });

    let calls = 0;
    const target = (): Promise<string> => {
      calls += 1;
      if (calls === 1) {
        throw new Error('fallo temporal');
      }
      return Promise.resolve('ok');
    };
    const decorated = decorator(target, methodContext('fetch', target));

    await expect(decorated.call({})).resolves.toBe('ok');
    expect(calls).toBe(2);
  });

  it('CircuitBreaker conserva las opciones validadas antes de crear su pipeline por instancia', async () => {
    const options = { failures: 2, resetMs: 1_000 };
    const decorator = CircuitBreaker(options);
    attemptMutation(() => {
      options.failures = 0;
      options.resetMs = 0;
    });

    const upstreamFailure = new Error('upstream failure');
    const target = function (this: { calls: number }): Promise<never> {
      this.calls += 1;
      throw upstreamFailure;
    };
    const decorated = decorator(target, methodContext('fetch', target));
    const receiver = { calls: 0 };
    const invoke = () => Promise.resolve().then(() => decorated.call(receiver));

    await expect(invoke()).rejects.toBe(upstreamFailure);
    await expect(invoke()).rejects.toBe(upstreamFailure);
    await expect(invoke()).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(receiver.calls).toBe(2);
  });
});

describe('tipos de Memoize', () => {
  it('excluye receptores primitivos en la sobrecarga factory', () => {
    const assertFactoryReceiverConstraint = (): void => {
      const decorator = Memoize();
      const target = function (this: string, id: number): string {
        return `${this}:${id}`;
      };
      const context = {} as ClassMethodDecoratorContext<string, typeof target>;

      // @ts-expect-error Memoize only supports object receivers so its instance cache can use WeakMap.
      decorator(target, context);
    };

    expectTypeOf(assertFactoryReceiverConstraint).toBeFunction();
  });
});
