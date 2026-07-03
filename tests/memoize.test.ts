import { describe, expect, it } from 'vitest';
import { Memoize } from '../src/patterns/utility/memoize';

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

describe('@Memoize con resolver de clave', () => {
  it('usa la clave personalizada: literales distintos con el mismo id comparten entrada', () => {
    let calls = 0;

    class Repo {
      @Memoize({ key: (user: { id: number }) => String(user.id) })
      permissions(user: { id: number }): number {
        void user;
        return ++calls;
      }
    }

    const repo = new Repo();
    expect(repo.permissions({ id: 1 })).toBe(1);
    expect(repo.permissions({ id: 1 })).toBe(1);
    expect(repo.permissions({ id: 2 })).toBe(2);
    expect(calls).toBe(2);
  });

  it('la clave personalizada admite argumentos circulares (JSON.stringify lanzaría)', () => {
    interface Node {
      name: string;
      self?: Node;
    }
    let calls = 0;

    class Walker {
      @Memoize({ key: (node: Node) => node.name })
      visit(node: Node): number {
        void node;
        return ++calls;
      }
    }

    const node: Node = { name: 'a' };
    node.self = node;

    const w = new Walker();
    expect(w.visit(node)).toBe(1);
    expect(w.visit(node)).toBe(1);
    expect(calls).toBe(1);
  });

  it('@Memoize() sin opciones equivale al comportamiento por defecto', () => {
    let calls = 0;

    class Calc {
      @Memoize()
      double(n: number): number {
        void n;
        return ++calls;
      }
    }

    const c = new Calc();
    expect(c.double(1)).toBe(1);
    expect(c.double(1)).toBe(1);
    expect(calls).toBe(1);
  });
});
