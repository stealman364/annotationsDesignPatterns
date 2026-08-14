import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnyMethod } from '../../src/core/types';
import { CachedFor } from '../../src/patterns/utility/cached-for';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';
import { CircuitBreakerOpenError } from '../../src/operators/circuit-breaker';
import { Fallback } from '../../src/patterns/utility/fallback';
import { Memoize } from '../../src/patterns/utility/memoize';
import { Retry } from '../../src/patterns/utility/retry';
import { Timeout } from '../../src/patterns/utility/timeout';

type ManualMethodDecorator<This extends object, Args extends readonly unknown[], Result> = (
  target: AnyMethod<This, Args, Result>,
  context: ClassMethodDecoratorContext<This, AnyMethod<This, Args, Result>>,
) => AnyMethod<This, Args, Result>;

function methodContext<This extends object, Args extends readonly unknown[], Result>(
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

function manualDecorator<This extends object, Args extends readonly unknown[], Result>(
  decorator: unknown,
): ManualMethodDecorator<This, Args, Result> {
  return decorator as ManualMethodDecorator<This, Args, Result>;
}

describe('equivalencia de decoradores con operadores', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('Fallback conserva un resultado síncrono al decorarse con un contexto TC39 manual', () => {
    interface Receiver {
      readonly prefix: string;
    }

    const target: AnyMethod<Receiver, readonly [number], string> = function (this, id) {
      return `${this.prefix}:${id}`;
    };
    const decorate = manualDecorator<Receiver, readonly [number], string>(Fallback('fallback'));
    const decorated = decorate(target, methodContext('load', target));

    expect(decorated.call({ prefix: 'account' }, 7)).toBe('account:7');
  });

  it('Retry conserva un resultado síncrono al decorarse con un contexto TC39 manual', () => {
    interface Receiver {
      readonly prefix: string;
    }

    const target: AnyMethod<Receiver, readonly [number], string> = function (this, id) {
      return `${this.prefix}:${id}`;
    };
    const decorate = manualDecorator<Receiver, readonly [number], string>(Retry({ attempts: 2 }));
    const decorated = decorate(target, methodContext('load', target));

    expect(decorated.call({ prefix: 'account' }, 7)).toBe('account:7');
  });

  it('CircuitBreaker mantiene el estado aislado entre instancias', async () => {
    interface Receiver {
      calls: number;
    }

    const target: AnyMethod<Receiver, readonly [], never> = function (): never {
      this.calls += 1;
      throw new Error('upstream failure');
    };
    const decorate = manualDecorator<Receiver, readonly [], never>(
      CircuitBreaker({ failures: 1, resetMs: 1_000 }),
    );
    const decorated = decorate(target, methodContext('load', target));
    const first = { calls: 0 };
    const second = { calls: 0 };

    await expect(decorated.call(first)).rejects.toThrow('upstream failure');
    await expect(decorated.call(first)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    await expect(decorated.call(second)).rejects.toThrow('upstream failure');

    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
  });

  it('Memoize mantiene entradas independientes para cada instancia', () => {
    interface Receiver {
      readonly prefix: string;
      calls: number;
    }

    const target: AnyMethod<Receiver, readonly [string], string> = function (this, id) {
      this.calls += 1;
      return `${this.prefix}:${id}:${this.calls}`;
    };
    const decorated = Memoize(target, methodContext('load', target));
    const first = { prefix: 'first', calls: 0 };
    const second = { prefix: 'second', calls: 0 };

    expect(decorated.call(first, 'account')).toBe('first:account:1');
    expect(decorated.call(first, 'account')).toBe('first:account:1');
    expect(decorated.call(second, 'account')).toBe('second:account:1');
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
  });

  it('CachedFor mantiene entradas independientes para cada instancia', () => {
    interface Receiver {
      readonly prefix: string;
      calls: number;
    }

    const target: AnyMethod<Receiver, readonly [string], string> = function (this, id) {
      this.calls += 1;
      return `${this.prefix}:${id}:${this.calls}`;
    };
    const decorate = CachedFor(1_000);
    const decorated = decorate(target, methodContext('load', target));
    const first = { prefix: 'first', calls: 0 };
    const second = { prefix: 'second', calls: 0 };

    expect(decorated.call(first, 'account')).toBe('first:account:1');
    expect(decorated.call(first, 'account')).toBe('first:account:1');
    expect(decorated.call(second, 'account')).toBe('second:account:1');
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
  });

  it('Timeout construye su error desde el nombre del contexto TC39', async () => {
    vi.useFakeTimers();

    const target: AnyMethod<object, readonly [], never> = () => new Promise<never>(() => undefined);
    const decorate = manualDecorator<object, readonly [], never>(Timeout(25));
    const decorated = decorate(target, methodContext('loadProfile', target));
    const assertion = expect(decorated.call({})).rejects.toThrow(
      'El método loadProfile superó el límite de 25 ms',
    );

    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
