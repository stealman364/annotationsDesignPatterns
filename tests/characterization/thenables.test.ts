import { describe, expect, it } from 'vitest';
import { Emits, Subject } from '../../src/patterns/behavioral/observer';
import { Log } from '../../src/patterns/utility/log';
import { Measure, type MeasureReport } from '../../src/patterns/utility/measure';

function fulfilledThenable(value: string) {
  return {
    then(onfulfilled: (resolved: string) => unknown): unknown {
      return onfulfilled(value);
    },
  };
}

describe('characterization: B5 custom thenables', () => {
  it('@Emits emits the resolved value from a custom thenable', async () => {
    class Service extends Subject {
      @Emits('done')
      run() {
        return fulfilledThenable('resolved');
      }
    }

    const service = new Service();
    const received: unknown[] = [];
    service.on('done', (payload) => received.push(payload));

    const result = service.run();

    expect(received).toEqual([]);
    await expect(Promise.resolve(result)).resolves.toBe('resolved');
    expect(received).toEqual(['resolved']);
  });

  it('@Log records a custom thenable success only after resolution', async () => {
    const lines: string[] = [];

    class Service {
      @Log({ logger: (line) => lines.push(line) })
      run() {
        return fulfilledThenable('resolved');
      }
    }

    const result = new Service().run();

    expect(lines).toHaveLength(1);
    await expect(Promise.resolve(result)).resolves.toBe('resolved');
    expect(lines[1]).toMatch(/^\u2190 run \u2713 \d+ ms$/);
  });

  it('@Measure records a custom thenable success only after resolution', async () => {
    const reports: MeasureReport[] = [];

    class Service {
      @Measure((report) => reports.push(report))
      run() {
        return fulfilledThenable('resolved');
      }
    }

    const result = new Service().run();

    expect(reports).toHaveLength(0);
    await expect(Promise.resolve(result)).resolves.toBe('resolved');
    expect(reports[0]).toMatchObject({ method: 'run', ok: true });
  });

  it('@Log treats a throwing then method as a rejected asynchronous result', async () => {
    const lines: string[] = [];
    const reason = new Error('then failed');

    class Service {
      @Log({ logger: (line) => lines.push(line) })
      run() {
        return {
          then(): never {
            throw reason;
          },
        };
      }
    }

    const result = new Service().run();

    expect(lines).toEqual(['\u2192 run()']);
    await expect(Promise.resolve(result)).rejects.toBe(reason);
    expect(lines[1]).toMatch(/^\u2190 run \u2717 \d+ ms: Error: then failed$/);
  });

  it('normalizes a throwing then getter as an asynchronous rejection', async () => {
    const reason = new Error('getter failed');
    class Service {
      @Log({ logger: () => undefined })
      run() {
        return Object.defineProperty({}, 'then', {
          get: () => {
            throw reason;
          },
        });
      }
    }
    await expect(Promise.resolve(new Service().run())).rejects.toBe(reason);
  });

  it('normalizes throwing then getters in Emits and Measure', async () => {
    const reason = new Error('getter failed');
    const broken = () =>
      Object.defineProperty({}, 'then', {
        get: () => {
          throw reason;
        },
      });
    class EmitsService extends Subject {
      @Emits('done') run() {
        return broken();
      }
    }
    const reports: MeasureReport[] = [];
    class MeasureService {
      @Measure((report) => reports.push(report)) run() {
        return broken();
      }
    }
    await expect(Promise.resolve(new EmitsService().run())).rejects.toBe(reason);
    await expect(Promise.resolve(new MeasureService().run())).rejects.toBe(reason);
    expect(reports).toMatchObject([{ method: 'run', ok: false }]);
  });
});
