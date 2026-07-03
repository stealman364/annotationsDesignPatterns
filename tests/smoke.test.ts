import { describe, expect, it } from 'vitest';
import { LIB_NAME } from '../src/index';

describe('toolchain', () => {
  it('exporta el nombre de la librería', () => {
    expect(LIB_NAME).toBe('annotations-design-patterns');
  });

  it('soporta decoradores TC39 de clase', () => {
    let decorated = false;
    function Marker<T extends new (...args: any[]) => object>(
      target: T,
      context: ClassDecoratorContext<T>
    ): T {
      decorated = context.kind === 'class';
      return target;
    }

    @Marker
    class Sample {}

    expect(new Sample()).toBeInstanceOf(Sample);
    expect(decorated).toBe(true);
  });
});
