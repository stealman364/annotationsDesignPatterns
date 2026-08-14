import { afterEach, describe, expect, it, vi } from 'vitest';
import { CachedFor } from '../../src/patterns/utility/cached-for';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';
import { Fallback } from '../../src/patterns/utility/fallback';
import { Memoize } from '../../src/patterns/utility/memoize';
import { Retry } from '../../src/patterns/utility/retry';
import { Timeout } from '../../src/patterns/utility/timeout';
import { cachedFor } from '../../src/operators/cached-for';
import { CircuitBreakerOpenError, circuitBreaker } from '../../src/operators/circuit-breaker';
import { fallback } from '../../src/operators/fallback';
import { memoize } from '../../src/operators/memoize';
import { retry } from '../../src/operators/retry';
import { TimeoutError, timeout } from '../../src/operators/timeout';

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('decorator and operator equivalence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives Fallback providers the same error, receiver-derived failure, and arguments', async () => {
    class DecoratedApi {
      constructor(private readonly prefix: string) {}

      @Fallback((error: unknown, id: number) => `fallback:${(error as Error).message}:${id}`)
      async load(id: number): Promise<string> {
        throw new Error(`${this.prefix}:${id}`);
      }
    }

    const target = async function (this: { prefix: string }, id: number): Promise<string> {
      throw new Error(`${this.prefix}:${id}`);
    };
    const wrapped = fallback<{ prefix: string }, readonly [number], string>(
      (error, id) => `fallback:${(error as Error).message}:${id}`,
    ).apply(target);

    await expect(new DecoratedApi('decorated').load(7)).resolves.toBe('fallback:decorated:7:7');
    await expect(wrapped.call({ prefix: 'operator' }, 7)).resolves.toBe('fallback:operator:7:7');
  });

  it('rejects at the same timeout boundary', async () => {
    vi.useFakeTimers();

    class DecoratedApi {
      @Timeout(100)
      async load(): Promise<string> {
        await wait(200);
        return 'late';
      }
    }

    const wrapped = timeout<object, readonly [], string>(100).apply(async () => {
      await wait(200);
      return 'late';
    });

    const decoratedResult = new DecoratedApi().load();
    const operatorResult = wrapped.call({});
    const decoratedAssertion = expect(decoratedResult).rejects.toBeInstanceOf(TimeoutError);
    const operatorAssertion = expect(operatorResult).rejects.toBeInstanceOf(TimeoutError);

    await vi.advanceTimersByTimeAsync(100);

    await Promise.all([decoratedAssertion, operatorAssertion]);
  });

  it('retries a rejected call with the same receiver and arguments', async () => {
    class DecoratedApi {
      attempts = 0;

      constructor(private readonly prefix: string) {}

      @Retry({ attempts: 2 })
      async load(id: string): Promise<string> {
        this.attempts += 1;
        if (this.attempts === 1) {
          throw new Error('temporary');
        }
        return `${this.prefix}:${id}:${this.attempts}`;
      }
    }

    const receiver = { prefix: 'operator', attempts: 0 };
    const wrapped = retry<typeof receiver, readonly [string], string>({ attempts: 2 }).apply(
      async function (this: typeof receiver, id: string): Promise<string> {
        this.attempts += 1;
        if (this.attempts === 1) {
          throw new Error('temporary');
        }
        return `${this.prefix}:${id}:${this.attempts}`;
      },
    );

    const decorated = new DecoratedApi('decorated');
    await expect(decorated.load('account')).resolves.toBe('decorated:account:2');
    await expect(wrapped.call(receiver, 'account')).resolves.toBe('operator:account:2');
    expect(decorated.attempts).toBe(2);
    expect(receiver.attempts).toBe(2);
  });

  it('opens CircuitBreaker after the same rejected invocation', async () => {
    const failure = new Error('upstream failure');

    class DecoratedApi {
      calls = 0;

      @CircuitBreaker({ failures: 1, resetMs: 1_000 })
      async load(id: string): Promise<string> {
        this.calls += 1;
        throw new Error(`${id}:${failure.message}`);
      }
    }

    const receiver = { calls: 0 };
    const wrapped = circuitBreaker<typeof receiver, readonly [string], string>({
      failures: 1,
      resetMs: 1_000,
    }).apply(async function (this: typeof receiver, id: string): Promise<string> {
      this.calls += 1;
      throw new Error(`${id}:${failure.message}`);
    });

    const decorated = new DecoratedApi();
    await expect(decorated.load('account')).rejects.toThrow('account:upstream failure');
    await expect(wrapped.call(receiver, 'account')).rejects.toThrow('account:upstream failure');
    await expect(decorated.load('account')).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    await expect(wrapped.call(receiver, 'account')).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(decorated.calls).toBe(1);
    expect(receiver.calls).toBe(1);
  });

  it('memoizes the same receiver-derived result for matching arguments', () => {
    class DecoratedApi {
      calls = 0;

      constructor(private readonly prefix: string) {}

      @Memoize
      load(id: string): string {
        this.calls += 1;
        return `${this.prefix}:${id}:${this.calls}`;
      }
    }

    const receiver = { prefix: 'operator', calls: 0 };
    const wrapped = memoize<typeof receiver, readonly [string], string>().apply(function (
      this: typeof receiver,
      id: string,
    ): string {
      this.calls += 1;
      return `${this.prefix}:${id}:${this.calls}`;
    });

    const decorated = new DecoratedApi('decorated');
    expect([decorated.load('account'), decorated.load('account')]).toEqual([
      'decorated:account:1',
      'decorated:account:1',
    ]);
    expect([wrapped.call(receiver, 'account'), wrapped.call(receiver, 'account')]).toEqual([
      'operator:account:1',
      'operator:account:1',
    ]);
    expect(decorated.calls).toBe(1);
    expect(receiver.calls).toBe(1);
  });

  it('expires CachedFor entries on the same schedule', () => {
    vi.useFakeTimers();

    class DecoratedApi {
      calls = 0;

      constructor(private readonly prefix: string) {}

      @CachedFor(100)
      load(id: string): string {
        this.calls += 1;
        return `${this.prefix}:${id}:${this.calls}`;
      }
    }

    const receiver = { prefix: 'operator', calls: 0 };
    const wrapped = cachedFor<typeof receiver, readonly [string], string>(100).apply(function (
      this: typeof receiver,
      id: string,
    ): string {
      this.calls += 1;
      return `${this.prefix}:${id}:${this.calls}`;
    });

    const decorated = new DecoratedApi('decorated');
    expect(decorated.load('account')).toBe('decorated:account:1');
    expect(wrapped.call(receiver, 'account')).toBe('operator:account:1');
    vi.advanceTimersByTime(100);
    expect(decorated.load('account')).toBe('decorated:account:2');
    expect(wrapped.call(receiver, 'account')).toBe('operator:account:2');
  });
});
