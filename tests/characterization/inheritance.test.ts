import { describe, expect, it } from 'vitest';
import { Singleton } from '../../src/patterns/creational/singleton';
import { Flyweight } from '../../src/patterns/structural/flyweight';

describe('caracterización de decoradores de clase en herencia', () => {
  it('@Singleton aísla la instancia derivada cuando la base se construye primero', () => {
    @Singleton
    class Base {}

    class Derived extends Base {}

    const base = new Base();
    const derived = new Derived();

    expect(derived).not.toBe(base);
    expect(derived).toBeInstanceOf(Derived);
  });

  it('@Singleton aísla la instancia base cuando la derivada se construye primero', () => {
    @Singleton
    class Base {}

    class Derived extends Base {}

    const derived = new Derived();
    const base = new Base();

    expect(base).not.toBe(derived);
    expect(base).toBeInstanceOf(Base);
  });

  it('@Flyweight aísla la cache de una derivada no decorada cuando la base se construye primero', () => {
    @Flyweight
    class Base {
      constructor(readonly id: string) {}
    }

    class Derived extends Base {}

    const base = new Base('same');
    const derived = new Derived('same');

    expect(new Base('same')).toBe(base);
    expect(new Derived('same')).toBe(derived);
    expect(base).not.toBe(derived);
    expect(base).toBeInstanceOf(Base);
    expect(derived).toBeInstanceOf(Derived);
  });

  it('@Flyweight aísla la cache de una derivada no decorada cuando la derivada se construye primero', () => {
    @Flyweight
    class Base {
      constructor(readonly id: string) {}
    }

    class Derived extends Base {}

    const derived = new Derived('same');
    const base = new Base('same');

    expect(new Derived('same')).toBe(derived);
    expect(new Base('same')).toBe(base);
    expect(derived).not.toBe(base);
    expect(derived).toBeInstanceOf(Derived);
    expect(base).toBeInstanceOf(Base);
  });
});
