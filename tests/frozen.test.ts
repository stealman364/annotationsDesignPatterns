import { describe, expect, it } from 'vitest';
import { Frozen } from '../src/patterns/structural/frozen';

describe('@Frozen', () => {
  it('congela las instancias tras construirlas', () => {
    @Frozen
    class Point {
      constructor(
        public x: number,
        public y: number
      ) {}
    }

    const p = new Point(1, 2);
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.x).toBe(1);
  });

  it('mutar una propiedad lanza TypeError (modo estricto)', () => {
    @Frozen
    class Point {
      constructor(public x: number) {}
    }

    const p = new Point(1);
    expect(() => {
      p.x = 99;
    }).toThrow(TypeError);
    expect(p.x).toBe(1);
  });

  it('preserva instanceof', () => {
    @Frozen
    class Value {}

    expect(new Value()).toBeInstanceOf(Value);
  });
});
