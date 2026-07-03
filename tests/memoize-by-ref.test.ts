import { describe, expect, it } from 'vitest';
import { MemoizeByRef } from '../src/patterns/utility/memoize-by-ref';

describe('@MemoizeByRef', () => {
  it('cachea por identidad: la misma referencia solo ejecuta una vez', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      process(config: { mode: string }): number {
        void config;
        return ++calls;
      }
    }

    const s = new Service();
    const config = { mode: 'fast' };
    expect(s.process(config)).toBe(1);
    expect(s.process(config)).toBe(1);
    expect(calls).toBe(1);
  });

  it('semántica por referencia: literales estructuralmente iguales son entradas distintas', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      process(config: { mode: string }): number {
        void config;
        return ++calls;
      }
    }

    const s = new Service();
    expect(s.process({ mode: 'fast' })).toBe(1);
    expect(s.process({ mode: 'fast' })).toBe(2);
    expect(calls).toBe(2);
  });

  it('admite argumentos circulares sin resolver de clave', () => {
    interface Node {
      name: string;
      self?: Node;
    }
    let calls = 0;

    class Walker {
      @MemoizeByRef
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

  it('distingue funciones por identidad (JSON.stringify las colapsaría)', () => {
    let calls = 0;

    class Runner {
      @MemoizeByRef
      run(fn: () => void): number {
        void fn;
        return ++calls;
      }
    }

    const r = new Runner();
    const a = () => {};
    const b = () => {};
    expect(r.run(a)).toBe(1);
    expect(r.run(b)).toBe(2);
    expect(r.run(a)).toBe(1);
    expect(calls).toBe(2);
  });

  it('combina primitivos y objetos en llamadas multi-argumento', () => {
    let calls = 0;

    class Calc {
      @MemoizeByRef
      compute(n: number, ctx: object): number {
        void n;
        void ctx;
        return ++calls;
      }
    }

    const c = new Calc();
    const ctx = {};
    expect(c.compute(1, ctx)).toBe(1);
    expect(c.compute(1, ctx)).toBe(1);
    expect(c.compute(2, ctx)).toBe(2);
    expect(c.compute(1, {})).toBe(3);
    expect(calls).toBe(3);
  });

  it('cada instancia tiene su propia cache (incluye métodos sin argumentos)', () => {
    let calls = 0;

    class Service {
      @MemoizeByRef
      next(): number {
        return ++calls;
      }
    }

    const a = new Service();
    const b = new Service();
    expect(a.next()).toBe(1);
    expect(b.next()).toBe(2);
    expect(a.next()).toBe(1);
    expect(calls).toBe(2);
  });
});
