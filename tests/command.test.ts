import { describe, expect, it } from 'vitest';
import { CommandHistory, Revertible } from '../src/patterns/command';

describe('CommandHistory + @Revertible', () => {
  it('registra cada llamada y permite deshacerla en orden inverso', () => {
    const history = new CommandHistory();

    class Counter {
      value = 0;

      @Revertible(history, 'decrement')
      increment(amount: number): void {
        this.value += amount;
      }

      decrement(amount: number): void {
        this.value -= amount;
      }
    }

    const counter = new Counter();
    counter.increment(5);
    counter.increment(3);
    expect(counter.value).toBe(8);
    expect(history.size).toBe(2);

    history.undoLast();
    expect(counter.value).toBe(5);
    history.undoLast();
    expect(counter.value).toBe(0);
    expect(history.size).toBe(0);
  });

  it('lanza al deshacer con el historial vacío', () => {
    const history = new CommandHistory();
    expect(() => history.undoLast()).toThrow('No hay comandos que deshacer');
  });

  it('lanza con mensaje claro si el método de deshacer no existe', () => {
    const history = new CommandHistory();

    class Broken {
      @Revertible(history, 'noExiste')
      act(): void {}
    }

    expect(() => new Broken().act()).toThrow('El método de deshacer "noExiste" no existe');
  });
});
