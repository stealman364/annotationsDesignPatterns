import { describe, expect, it } from 'vitest';
import { overlap } from '../../src/operators/overlap';
import { Semaphore } from '../../src/patterns/utility/semaphore';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('independently reconstructed v2 concurrency bugs', () => {
  it('never executes an aborted overlap waiter', async () => {
    const active = deferred();
    const starts: string[] = [];
    const controller = new AbortController();
    const operation = pipe(
      function (id: string) {
        starts.push(id);
        return id === 'active' ? active.promise : id;
      },
      overlap<object, readonly [string], string>({ mode: 'queue', key: () => 'key' }),
    );
    const first = run({}, ['active'], operation, {});
    const queued = run({}, ['queued'], operation, { signal: controller.signal });
    const reason = new Error('cancelled');
    const assertion = expect(queued).rejects.toBe(reason);
    controller.abort(reason);
    await assertion;
    active.resolve('active');
    await expect(first).resolves.toBe('active');
    expect(starts).toEqual(['active']);
  });

  it('prevents a newcomer from barging before a reserved semaphore waiter', async () => {
    const gates = [deferred(), deferred(), deferred()];
    let active = 0;
    let peak = 0;
    class Service {
      @Semaphore(1)
      run(id: number): Promise<string> {
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
    let third!: Promise<string>;
    void gates[0]!.promise.then(() => {
      third = service.run(2);
    });
    gates[0]!.resolve('first');
    await first;
    await Promise.resolve();
    expect(peak).toBe(1);
    gates[1]!.resolve('second');
    gates[2]!.resolve('third');
    await Promise.all([second, third]);
    expect(active).toBe(0);
  });
});
