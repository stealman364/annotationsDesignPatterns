import { describe, expect, it } from 'vitest';
import { Factory, RegisterIn } from '../src/patterns/creational/factory';

interface Shape {
  area(): number;
}

describe('Factory + @RegisterIn', () => {
  it('crea instancias por clave registrada con el decorador', () => {
    const shapes = new Factory<Shape>();

    @RegisterIn(shapes, 'circle')
    class Circle implements Shape {
      constructor(private radius: number) {}
      area(): number {
        return Math.PI * this.radius ** 2;
      }
    }

    @RegisterIn(shapes, 'square')
    class Square implements Shape {
      constructor(private side: number) {}
      area(): number {
        return this.side ** 2;
      }
    }

    const circle = shapes.create('circle', 1);
    const square = shapes.create('square', 3);

    expect(circle).toBeInstanceOf(Circle);
    expect(square.area()).toBe(9);
    expect(shapes.keys().sort()).toEqual(['circle', 'square']);
  });

  it('lanza con mensaje claro si la clave no existe', () => {
    const shapes = new Factory<Shape>();

    @RegisterIn(shapes, 'circle')
    class Circle implements Shape {
      area(): number {
        return 0;
      }
    }
    void Circle;

    expect(() => shapes.create('triangle')).toThrow('Clave "triangle" no registrada');
  });

  it('lanza si se registra dos veces la misma clave', () => {
    const shapes = new Factory<Shape>();
    shapes.register('circle', class implements Shape {
      area(): number {
        return 0;
      }
    });

    expect(() =>
      shapes.register('circle', class implements Shape {
        area(): number {
          return 1;
        }
      })
    ).toThrow('ya está registrada');
  });
});
