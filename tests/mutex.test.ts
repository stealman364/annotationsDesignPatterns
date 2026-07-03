import { describe, expect, it } from 'vitest';
import { Mutex } from '../src/patterns/utility/mutex';

describe('@Mutex', () => {
  it('serializa las llamadas concurrentes en la misma instancia', async () => {
    const order: string[] = [];

    class Db {
      @Mutex
      async write(id: number): Promise<void> {
        order.push(`start:${id}`);
        await Promise.resolve();
        order.push(`end:${id}`);
      }
    }

    const db = new Db();
    await Promise.all([db.write(1), db.write(2)]);
    expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
  });

  it('un fallo no bloquea las llamadas siguientes', async () => {
    class Job {
      @Mutex
      async run(fail: boolean): Promise<string> {
        if (fail) {
          throw new Error('boom');
        }
        return 'ok';
      }
    }

    const j = new Job();
    await expect(j.run(true)).rejects.toThrow('boom');
    await expect(j.run(false)).resolves.toBe('ok');
  });

  it('instancias distintas no comparten el candado', async () => {
    const order: string[] = [];

    class Worker {
      constructor(private name: string) {}

      @Mutex
      async work(): Promise<void> {
        order.push(`start:${this.name}`);
        await Promise.resolve();
        order.push(`end:${this.name}`);
      }
    }

    await Promise.all([new Worker('a').work(), new Worker('b').work()]);
    expect(order).toEqual(['start:a', 'start:b', 'end:a', 'end:b']);
  });
});
