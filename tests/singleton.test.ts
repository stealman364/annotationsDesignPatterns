import { describe, expect, expectTypeOf, it } from 'vitest';
import { Singleton } from '../src/patterns/creational/singleton';

describe('@Singleton', () => {
  it('devuelve siempre la misma instancia', () => {
    @Singleton
    class Database {
      connections = 0;
    }

    const a = new Database();
    const b = new Database();
    a.connections = 5;

    expect(a).toBe(b);
    expect(b.connections).toBe(5);
  });

  it('conserva los argumentos de la primera construcción e ignora los siguientes', () => {
    @Singleton
    class Config {
      constructor(public env: string) {}
    }

    const first = new Config('prod');
    const second = new Config('dev');

    expect(first.env).toBe('prod');
    expect(second.env).toBe('prod');
  });

  it('preserva instanceof', () => {
    @Singleton
    class Service {}

    expect(new Service()).toBeInstanceOf(Service);
  });

  it('cada clase decorada tiene su propia instancia', () => {
    @Singleton
    class A {}
    @Singleton
    class B {}

    expect(new A()).not.toBe(new B());
  });

  it('aísla la instancia de una derivada no decorada cuando la base se construye primero', () => {
    @Singleton
    class Base {
      constructor(public readonly value: string) {}
    }

    class Derived extends Base {
      constructor(
        value: string,
        public readonly derivedValue: string,
      ) {
        super(value);
      }
    }

    const base = new Base('base-first');
    const derived = new Derived('derived-first', 'derived-only');

    expect(new Base('ignored')).toBe(base);
    expect(new Derived('ignored', 'ignored')).toBe(derived);
    expect(base).not.toBe(derived);
    expect(base).toBeInstanceOf(Base);
    expect(derived).toBeInstanceOf(Derived);
    expect(base.value).toBe('base-first');
    expect(derived.value).toBe('derived-first');
    expect(derived.derivedValue).toBe('ignored');
  });

  it('aísla la instancia de una derivada no decorada cuando la derivada se construye primero', () => {
    @Singleton
    class Base {
      constructor(public readonly value: string) {}
    }

    class Derived extends Base {
      constructor(
        value: string,
        public readonly derivedValue: string,
      ) {
        super(value);
      }
    }

    const derived = new Derived('derived-first', 'derived-only');
    const base = new Base('base-first');

    expect(new Derived('ignored', 'ignored')).toBe(derived);
    expect(new Base('ignored')).toBe(base);
    expect(derived).not.toBe(base);
    expect(derived).toBeInstanceOf(Derived);
    expect(base).toBeInstanceOf(Base);
    expect(derived.value).toBe('derived-first');
    expect(derived.derivedValue).toBe('ignored');
    expect(base.value).toBe('base-first');
  });

  it('preserva la tupla de argumentos y el tipo de instancia del constructor', () => {
    @Singleton
    class Connection {
      constructor(
        public readonly host: string,
        public readonly port?: number,
      ) {}
    }

    expectTypeOf<ConstructorParameters<typeof Connection>>().toEqualTypeOf<
      [host: string, port?: number]
    >();
    expectTypeOf<InstanceType<typeof Connection>>().toEqualTypeOf<Connection>();
    expectTypeOf(new Connection('localhost', 5432)).toEqualTypeOf<Connection>();
  });
});
