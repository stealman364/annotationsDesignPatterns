import { describe, expect, it } from 'vitest';
import { Semaphore } from '../src/patterns/utility/semaphore';

describe('@Semaphore', () => {
  it('limita las ejecuciones simultáneas a maxConcurrent', async () => {
    let active = 0;
    let maxActive = 0;

    class Downloader {
      @Semaphore(2)
      async download(id: number): Promise<void> {
        void id;
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        await Promise.resolve();
        active--;
      }
    }

    const d = new Downloader();
    await Promise.all([d.download(1), d.download(2), d.download(3), d.download(4)]);
    expect(maxActive).toBe(2);
    expect(active).toBe(0);
  });

  it('con límite 1 serializa como @Mutex', async () => {
    const order: string[] = [];

    class Db {
      @Semaphore(1)
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

  it('un fallo libera el hueco', async () => {
    class Job {
      @Semaphore(1)
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

  it('rechaza límites no positivos', () => {
    expect(() => Semaphore(0)).toThrow(RangeError);
  });
});
