import { describe, expect, it } from 'vitest';
import { Memoize } from '../src/patterns/memoize';

describe('@Memoize', () => {
  it('solo ejecuta el método una vez por combinación de argumentos', () => {
    let calls = 0;

    class Calculator {
      @Memoize
      square(n: number): number {
        calls++;
        return n * n;
      }
    }

    const calc = new Calculator();
    expect(calc.square(4)).toBe(16);
    expect(calc.square(4)).toBe(16);
    expect(calc.square(5)).toBe(25);
    expect(calls).toBe(2);
  });

  it('mantiene una cache separada por instancia', () => {
    let calls = 0;

    class Counter {
      @Memoize
      next(): number {
        return ++calls;
      }
    }

    const a = new Counter();
    const b = new Counter();
    expect(a.next()).toBe(1);
    expect(a.next()).toBe(1);
    expect(b.next()).toBe(2);
  });

  it('preserva el valor de this', () => {
    class Greeter {
      constructor(private name: string) {}

      @Memoize
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter('Ana').greet()).toBe('Hola, Ana');
  });
});
