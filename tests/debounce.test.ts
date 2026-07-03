import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Debounce } from '../src/patterns/debounce';

describe('@Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('solo ejecuta la última llamada dentro de la ventana', () => {
    const received: string[] = [];

    class Search {
      @Debounce(100)
      query(text: string): void {
        received.push(text);
      }
    }

    const s = new Search();
    s.query('a');
    s.query('ab');
    s.query('abc');
    expect(received).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(received).toEqual(['abc']);
  });

  it('cada instancia tiene su propio temporizador', () => {
    let calls = 0;

    class Widget {
      @Debounce(50)
      refresh(): void {
        calls++;
      }
    }

    const a = new Widget();
    const b = new Widget();
    a.refresh();
    b.refresh();
    vi.advanceTimersByTime(50);
    expect(calls).toBe(2);
  });

  it('rechaza retardos no positivos', () => {
    expect(() => Debounce(0)).toThrow(RangeError);
    expect(() => Debounce(-5)).toThrow(RangeError);
  });
});
