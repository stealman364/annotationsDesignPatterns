import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Throttle } from '../src/patterns/utility/throttle';

describe('@Throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ejecuta la primera llamada y descarta las siguientes dentro del intervalo', () => {
    let calls = 0;

    class Scroller {
      @Throttle(100)
      onScroll(): void {
        calls++;
      }
    }

    const s = new Scroller();
    s.onScroll();
    s.onScroll();
    s.onScroll();
    expect(calls).toBe(1);

    vi.advanceTimersByTime(100);
    s.onScroll();
    expect(calls).toBe(2);
  });

  it('cada instancia tiene su propio intervalo', () => {
    let calls = 0;

    class Widget {
      @Throttle(100)
      ping(): void {
        calls++;
      }
    }

    new Widget().ping();
    new Widget().ping();
    expect(calls).toBe(2);
  });

  it('rechaza intervalos no positivos', () => {
    expect(() => Throttle(0)).toThrow(RangeError);
  });
});
