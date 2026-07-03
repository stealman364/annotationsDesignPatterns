import { describe, expect, it } from 'vitest';
import { Lazy } from '../src/patterns/lazy';

describe('@Lazy', () => {
  it('calcula el getter una sola vez por instancia', () => {
    let computations = 0;

    class Report {
      @Lazy
      get summary(): string {
        computations++;
        return 'resumen';
      }
    }

    const r = new Report();
    expect(r.summary).toBe('resumen');
    expect(r.summary).toBe('resumen');
    expect(computations).toBe(1);
  });

  it('cada instancia calcula su propio valor', () => {
    let next = 0;

    class Sequence {
      @Lazy
      get id(): number {
        return ++next;
      }
    }

    const a = new Sequence();
    const b = new Sequence();
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a.id).toBe(1);
  });

  it('cachea también valores undefined', () => {
    let computations = 0;

    class Box {
      @Lazy
      get nothing(): undefined {
        computations++;
        return undefined;
      }
    }

    const box = new Box();
    expect(box.nothing).toBeUndefined();
    expect(box.nothing).toBeUndefined();
    expect(computations).toBe(1);
  });
});
