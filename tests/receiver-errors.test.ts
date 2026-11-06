import { afterEach, describe, expect, it, vi } from 'vitest';
import { Memoize } from '../src/patterns/utility/memoize';
import { CachedFor } from '../src/patterns/utility/cached-for';
import { CircuitBreaker } from '../src/patterns/utility/circuit-breaker';
import { MemoizeByRef } from '../src/patterns/utility/memoize-by-ref';
import { Once } from '../src/patterns/utility/once';
import { Lazy } from '../src/patterns/utility/lazy';
import { Mutex } from '../src/patterns/utility/mutex';
import { Throttle } from '../src/patterns/utility/throttle';
import { Debounce } from '../src/patterns/utility/debounce';
import { RateLimit } from '../src/patterns/utility/rate-limit';

let effects = 0;
class Service {
  @Memoize memoized(): string {
    effects++;
    return 'ok';
  }
  @CachedFor(100) cached(): string {
    effects++;
    return 'ok';
  }
  @CircuitBreaker({ failures: 1, resetMs: 100 }) async circuit(): Promise<string> {
    effects++;
    return 'ok';
  }
  @MemoizeByRef byRef(): string {
    effects++;
    return 'ok';
  }
  @Once once(): string {
    effects++;
    return 'ok';
  }
  @Lazy get lazy(): string {
    effects++;
    return 'ok';
  }
  @Mutex async mutex(): Promise<string> {
    effects++;
    return 'ok';
  }
  @Throttle(100) throttled(): void {
    effects++;
  }
  @Debounce(100) debounced(): void {
    effects++;
  }
  @RateLimit(1, 100) rateLimited(): void {
    effects++;
  }
}

const names = [
  'memoized',
  'cached',
  'circuit',
  'byRef',
  'once',
  'mutex',
  'throttled',
  'debounced',
  'rateLimited',
] as const;
const methods: Array<readonly [string, () => unknown]> = names.map((name) => [
  name,
  Service.prototype[name],
]);
methods.push(['lazy', Object.getOwnPropertyDescriptor(Service.prototype, 'lazy')!.get!]);

describe('instance decorator receiver diagnostics', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(methods)(
    '%s rejects detached/null/primitive receivers before side effects',
    async (_name, method) => {
      vi.useFakeTimers();
      effects = 0;
      for (const receiver of [undefined, null, 1, 'text', false, 1n, Symbol('invalid')]) {
        await expect(
          Promise.resolve().then(() => Reflect.apply(method, receiver, [])),
        ).rejects.toThrow(/requires an object receiver/);
      }
      expect(effects).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('retains object and function receivers and independent instance caches', () => {
    effects = 0;
    const first = new Service();
    const second = new Service();
    const method = first.memoized;
    const functionReceiver = () => undefined;
    expect(Reflect.apply(method, first, [])).toBe('ok');
    expect(Reflect.apply(method, first, [])).toBe('ok');
    expect(Reflect.apply(method, second, [])).toBe('ok');
    expect(Reflect.apply(method, functionReceiver, [])).toBe('ok');
    expect(Reflect.apply(method, functionReceiver, [])).toBe('ok');
    expect(effects).toBe(3);
  });
});
