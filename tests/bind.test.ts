import { describe, expect, it } from 'vitest';
import { Bind } from '../src/patterns/utility/bind';

describe('@Bind', () => {
  it('mantiene this al desestructurar el método', () => {
    class Counter {
      count = 0;

      @Bind
      increment(): number {
        return ++this.count;
      }
    }

    const counter = new Counter();
    const inc = counter.increment;
    expect(inc()).toBe(1);
    expect(inc()).toBe(2);
    expect(counter.count).toBe(2);
  });

  it('cada instancia liga su propio this', () => {
    class Counter {
      count = 0;

      @Bind
      increment(): number {
        return ++this.count;
      }
    }

    const a = new Counter();
    const b = new Counter();
    const incA = a.increment;
    const incB = b.increment;
    incA();
    incA();
    incB();
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
  });

  it('el método sigue funcionando llamado con normalidad', () => {
    class Greeter {
      name = 'Ana';

      @Bind
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter().greet()).toBe('Hola, Ana');
  });
});
