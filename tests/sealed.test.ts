import { describe, expect, it } from 'vitest';
import { Sealed } from '../src/patterns/structural/sealed';

describe('@Sealed', () => {
  it('sella las instancias: no se pueden añadir propiedades', () => {
    @Sealed
    class Config {
      constructor(public host: string) {}
    }

    const c = new Config('localhost');
    expect(Object.isSealed(c)).toBe(true);
    expect(() => {
      (c as unknown as Record<string, unknown>).extra = 1;
    }).toThrow(TypeError);
  });

  it('las propiedades existentes siguen siendo modificables', () => {
    @Sealed
    class Config {
      constructor(public host: string) {}
    }

    const c = new Config('localhost');
    c.host = 'example.com';
    expect(c.host).toBe('example.com');
  });

  it('preserva instanceof', () => {
    @Sealed
    class Service {}

    expect(new Service()).toBeInstanceOf(Service);
  });
});
