import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimit } from '../src/patterns/utility/rate-limit';

describe('@RateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('permite como máximo maxCalls por ventana y descarta el resto', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(2, 1000)
      send(): void {
        calls++;
      }
    }

    const n = new Notifier();
    n.send();
    n.send();
    n.send();
    expect(calls).toBe(2);

    vi.advanceTimersByTime(1000);
    n.send();
    expect(calls).toBe(3);
  });

  it('la ventana es deslizante: las llamadas antiguas van caducando', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(2, 1000)
      send(): void {
        calls++;
      }
    }

    const n = new Notifier();
    n.send(); // t=0
    vi.advanceTimersByTime(600);
    n.send(); // t=600
    n.send(); // t=600, descartada (2 en ventana)
    expect(calls).toBe(2);

    vi.advanceTimersByTime(500); // t=1100: la de t=0 ya caducó
    n.send();
    expect(calls).toBe(3);
  });

  it('cada instancia tiene su propio contador', () => {
    let calls = 0;

    class Notifier {
      @RateLimit(1, 1000)
      send(): void {
        calls++;
      }
    }

    new Notifier().send();
    new Notifier().send();
    expect(calls).toBe(2);
  });

  it('rechaza configuraciones inválidas', () => {
    expect(() => RateLimit(0, 1000)).toThrow(RangeError);
    expect(() => RateLimit(1, 0)).toThrow(RangeError);
  });
});
