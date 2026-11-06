import { describe, expect, it } from 'vitest';
import { Semaphore } from '../src/patterns/utility/semaphore';

describe('@Semaphore', () => {
  it('reserves a released permit for its waiter before a newcomer can barge', async () => {
    const gates = Array.from({ length: 3 }, () => {
      let resolve!: () => void;
      const promise = new Promise<void>((complete) => {
        resolve = complete;
      });
      return { promise, resolve };
    });
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    class Service {
      @Semaphore(1)
      run(id: number): Promise<void> {
        starts.push(id);
        active++;
        peak = Math.max(peak, active);
        const gate = gates[id]!;
        void gate.promise.then(() => {
          active--;
        });
        return gate.promise;
      }
    }
    const service = new Service();
    const first = service.run(0);
    const second = service.run(1);
    let third!: Promise<void>;
    void gates[0]!.promise.then(() => {
      third = service.run(2);
    });
    gates[0]!.resolve();
    await first;
    await Promise.resolve();
    expect(peak).toBe(1);
    expect(starts).toEqual([0, 1]);
    gates[1]!.resolve();
    await second;
    gates[2]!.resolve();
    await third;
    expect(starts).toEqual([0, 1, 2]);
    expect(active).toBe(0);
  });
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

  it('rejects applying the method decorator to a non-method context', () => {
    const context = { kind: 'getter' } as unknown as ClassMethodDecoratorContext<
      object,
      () => Promise<void>
    >;
    expect(() => Semaphore(1)(async () => {}, context)).toThrow(TypeError);
  });

  it('releases its permit when the target throws before returning a promise', async () => {
    class Service {
      @Semaphore(1)
      run(fail: boolean): Promise<string> {
        if (fail) throw new Error('synchronous failure');
        return Promise.resolve('ok');
      }
    }
    const service = new Service();
    const failed = service.run(true);
    const next = service.run(false);
    await expect(failed).rejects.toThrow('synchronous failure');
    await expect(next).resolves.toBe('ok');
  });

  it('keeps detached-call receiver failures in the rejected-promise channel', async () => {
    class Service {
      @Semaphore(1)
      async run(): Promise<string> {
        return 'unexpected';
      }
    }
    const detached = new Service().run;
    let result: unknown;
    expect(() => {
      result = detached();
    }).not.toThrow();
    await expect(result).rejects.toBeInstanceOf(TypeError);
  });

  it.each([1, 3])('maintains its limit of %s through 100 calls and failures', async (permits) => {
    let active = 0;
    let peak = 0;
    const starts: number[] = [];
    class Service {
      @Semaphore(permits)
      async run(id: number): Promise<number> {
        starts.push(id);
        active++;
        peak = Math.max(peak, active);
        try {
          await Promise.resolve();
          if (id % 7 === 0) throw new Error('business failure');
          return id;
        } finally {
          active--;
        }
      }
    }
    const service = new Service();
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, (_, id) => service.run(id)),
    );
    expect(peak).toBe(permits);
    expect(active).toBe(0);
    expect(starts).toEqual(Array.from({ length: 100 }, (_, id) => id));
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(15);
    await expect(service.run(101)).resolves.toBe(101);
  });

  it('starts free-permit work immediately and keeps instance queues independent', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((complete) => {
      resolve = complete;
    });
    const starts: string[] = [];
    class Service {
      @Semaphore(1)
      run(id: string): Promise<void> {
        starts.push(id);
        return pending;
      }
    }
    const firstService = new Service();
    const secondService = new Service();
    const first = firstService.run('first');
    const queued = firstService.run('queued');
    const independent = secondService.run('independent');
    expect(starts).toEqual(['first', 'independent']);
    resolve();
    await Promise.all([first, queued, independent]);
    expect(starts).toEqual(['first', 'independent', 'queued']);
  });
});
