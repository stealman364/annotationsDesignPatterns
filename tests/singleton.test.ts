import { describe, expect, it } from 'vitest';
import { Singleton } from '../src/patterns/singleton';

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
});
