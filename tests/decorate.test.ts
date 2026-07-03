import { describe, expect, it } from 'vitest';
import { Decorate, type MethodWrapper } from '../src/patterns/decorate';

const withLogging = (log: string[]): MethodWrapper<unknown, [number, number], number> => {
  return (original) =>
    function (...args) {
      log.push(`args: ${args.join(',')}`);
      const result = original.apply(this, args);
      log.push(`result: ${result}`);
      return result;
    };
};

describe('@Decorate', () => {
  it('envuelve el método con el wrapper', () => {
    const log: string[] = [];

    class Calc {
      @Decorate(withLogging(log))
      add(a: number, b: number): number {
        return a + b;
      }
    }

    expect(new Calc().add(2, 3)).toBe(5);
    expect(log).toEqual(['args: 2,3', 'result: 5']);
  });

  it('se pueden apilar varios @Decorate (el más cercano al método se aplica primero)', () => {
    const order: string[] = [];
    const tag =
      (name: string): MethodWrapper<unknown, [], void> =>
      (original) =>
        function () {
          order.push(name);
          original.apply(this);
        };

    class Task {
      @Decorate(tag('externo'))
      @Decorate(tag('interno'))
      run(): void {
        order.push('método');
      }
    }

    new Task().run();
    expect(order).toEqual(['externo', 'interno', 'método']);
  });

  it('preserva this', () => {
    class Greeter {
      name = 'Ana';

      @Decorate<Greeter, [], string>((original) =>
        function () {
          return `[${original.apply(this)}]`;
        }
      )
      greet(): string {
        return `Hola, ${this.name}`;
      }
    }

    expect(new Greeter().greet()).toBe('[Hola, Ana]');
  });
});
