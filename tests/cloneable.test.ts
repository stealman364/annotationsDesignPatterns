import { describe, expect, expectTypeOf, it } from 'vitest';
import { Cloneable, type WithClone } from '../src/patterns/creational/cloneable';

describe('@Cloneable', () => {
  it('clone() crea una copia independiente con el mismo estado', () => {
    @Cloneable
    class Document {
      constructor(
        public title: string,
        public tags: string[],
      ) {}
    }

    const original = new Document('spec', ['draft']) as WithClone<Document>;
    const copy = original.clone();

    expect(copy).not.toBe(original);
    expect(copy.title).toBe('spec');
    copy.title = 'copia';
    expect(original.title).toBe('spec');
  });

  it('la copia preserva instanceof', () => {
    @Cloneable
    class Shape {
      kind = 'circle';
    }

    const copy = (new Shape() as WithClone<Shape>).clone();
    expect(copy).toBeInstanceOf(Shape);
  });

  it('la copia es superficial (los objetos anidados se comparten)', () => {
    @Cloneable
    class Box {
      constructor(public items: string[]) {}
    }

    const original = new Box(['a']) as WithClone<Box>;
    const copy = original.clone();
    expect(copy.items).toBe(original.items);
  });

  it('el tipo WithClone expone clone() tipado', () => {
    @Cloneable
    class Point {
      x = 0;
    }

    const p = new Point() as WithClone<Point>;
    expectTypeOf(p.clone).returns.toEqualTypeOf<WithClone<Point>>();
    expectTypeOf(p.clone().x).toEqualTypeOf<number>();
  });
});
