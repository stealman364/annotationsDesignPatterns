import { describe, expect, it } from 'vitest';
import { Flyweight } from '../src/patterns/structural/flyweight';

describe('@Flyweight', () => {
  it('reutiliza la instancia cuando los argumentos coinciden', () => {
    let constructions = 0;

    @Flyweight
    class Color {
      constructor(public name: string) {
        constructions++;
      }
    }

    const a = new Color('red');
    const b = new Color('red');
    const c = new Color('blue');

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(constructions).toBe(2);
  });

  it('distingue combinaciones de varios argumentos', () => {
    @Flyweight
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }

    expect(new Point(1, 2)).toBe(new Point(1, 2));
    expect(new Point(1, 2)).not.toBe(new Point(2, 1));
  });

  it('preserva instanceof', () => {
    @Flyweight
    class Glyph {
      constructor(public char: string) {}
    }

    expect(new Glyph('a')).toBeInstanceOf(Glyph);
  });

  it('cada clase decorada tiene su propia cache', () => {
    @Flyweight
    class A {
      constructor(public v: number) {}
    }
    @Flyweight
    class B {
      constructor(public v: number) {}
    }

    expect(new A(1)).not.toBe(new B(1));
  });
});
