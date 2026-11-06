import { describe, expect, it } from 'vitest';
import { CommandHistory, Revertible } from '../src/patterns/behavioral/command';

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

  it('does not register an async operation that rejects', async () => {
    const history = new CommandHistory();
    const failure = new Error('operation failed');
    class Worker {
      @Revertible(history, 'undo')
      act(): Promise<void> {
        return Promise.reject(failure);
      }
      undo(): void {}
    }
    await expect(new Worker().act()).rejects.toBe(failure);
    expect(history.size).toBe(0);
  });

  it('retains a command when undo throws so it can be retried', () => {
    const history = new CommandHistory();
    const failure = new Error('undo failed');
    let fails = true;
    history.push({
      execute(): void {},
      undo(): void {
        if (fails) throw failure;
      },
    });
    expect(() => history.undoLast()).toThrow(failure);
    expect(history.size).toBe(1);
    fails = false;
    history.undoLast();
    expect(history.size).toBe(0);
  });

  it('undoes a preceding command during reentrant undo without invoking itself again', () => {
    const history = new CommandHistory();
    const undone: string[] = [];
    let outerCalls = 0;
    history.push({
      execute(): void {},
      undo(): void {
        undone.push('previous');
      },
    });
    history.push({
      execute(): void {},
      undo(): void {
        if (++outerCalls > 1) throw new Error('unexpected recursive undo');
        expect(history.size).toBe(2);
        history.undoLast();
        undone.push('current');
      },
    });
    history.undoLast();
    expect(undone).toEqual(['previous', 'current']);
    expect(history.size).toBe(0);
    expect(outerCalls).toBe(1);
  });

  it('retains a failing outer undo after a nested previous undo succeeds', () => {
    const history = new CommandHistory();
    const failure = new Error('outer undo failed');
    let previousCalls = 0;
    let outerCalls = 0;
    let nesting = false;
    history.push({
      execute(): void {},
      undo(): void {
        previousCalls += 1;
      },
    });
    history.push({
      execute(): void {},
      undo(): void {
        if (nesting) throw new Error('unexpected recursive undo');
        outerCalls += 1;
        if (outerCalls === 1) {
          nesting = true;
          try {
            history.undoLast();
          } finally {
            nesting = false;
          }
          throw failure;
        }
      },
    });
    expect(() => history.undoLast()).toThrow(failure);
    expect(previousCalls).toBe(1);
    expect(history.size).toBe(1);
    history.undoLast();
    expect(history.size).toBe(0);
    expect(outerCalls).toBe(2);
  });

  it('treats the same command object pushed twice as separate history entries', () => {
    const history = new CommandHistory();
    let calls = 0;
    const command = {
      execute(): void {},
      undo(): void {
        calls += 1;
        if (calls > 2) throw new Error('unexpected recursive undo');
        if (calls === 1) history.undoLast();
      },
    };
    history.push(command);
    history.push(command);
    history.undoLast();
    expect(calls).toBe(2);
    expect(history.size).toBe(0);
  });

  it('does not register a synchronous operation that throws', () => {
    const history = new CommandHistory();
    const failure = new Error('operation failed');
    class Worker {
      @Revertible(history, 'undo')
      act(): void {
        throw failure;
      }
      undo(): void {}
    }
    expect(() => new Worker().act()).toThrow(failure);
    expect(history.size).toBe(0);
  });

  it('registers async operations in completion order and preserves arguments and receiver', async () => {
    const history = new CommandHistory();
    const undone: Array<readonly [Worker, object]> = [];
    const firstArg = {};
    const secondArg = {};
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPending = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });
    class Worker {
      @Revertible(history, 'undo')
      act(arg: object): Promise<void> {
        return arg === firstArg ? firstPending : secondPending;
      }
      undo(arg: object): void {
        undone.push([this, arg]);
      }
    }
    const worker = new Worker();
    const first = worker.act(firstArg);
    const second = worker.act(secondArg);
    expect(history.size).toBe(0);
    resolveSecond();
    await second;
    expect(history.size).toBe(1);
    resolveFirst();
    await first;
    expect(history.size).toBe(2);
    history.undoLast();
    history.undoLast();
    expect(undone).toEqual([
      [worker, firstArg],
      [worker, secondArg],
    ]);
  });

  it('assimilates a custom thenable and registers only after resolution', async () => {
    const history = new CommandHistory();
    let resolve!: (value: string) => void;
    class Worker {
      @Revertible(history, 'undo')
      act() {
        return {
          then(onfulfilled: (value: string) => void): void {
            resolve = onfulfilled;
          },
        };
      }
      undo(): void {}
    }
    const result = new Worker().act();
    expect(history.size).toBe(0);
    const assimilated = Promise.resolve(result as unknown as PromiseLike<string>);
    await Promise.resolve();
    resolve('done');
    await expect(assimilated).resolves.toBe('done');
    expect(history.size).toBe(1);
  });

  it('does not register when assimilating a thenable fails', async () => {
    const history = new CommandHistory();
    const failure = new Error('then getter failed');
    class Worker {
      @Revertible(history, 'undo')
      act(): object {
        return Object.defineProperty({}, 'then', {
          get(): never {
            throw failure;
          },
        });
      }
      undo(): void {}
    }
    await expect(Promise.resolve(new Worker().act())).rejects.toBe(failure);
    expect(history.size).toBe(0);
  });
});
