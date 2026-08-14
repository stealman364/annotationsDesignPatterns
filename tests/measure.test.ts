import { describe, expect, it } from 'vitest';
import { Measure, type MeasureReport } from '../src/patterns/utility/measure';

describe('@Measure', () => {
  it('reporta método, duración y éxito', () => {
    const reports: MeasureReport[] = [];

    class Calc {
      @Measure((r) => reports.push(r))
      add(a: number, b: number): number {
        return a + b;
      }
    }

    expect(new Calc().add(2, 3)).toBe(5);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ method: 'add', ok: true });
    expect(reports[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reporta ok: false cuando el método lanza y propaga el error', () => {
    const reports: MeasureReport[] = [];

    class Job {
      @Measure((r) => reports.push(r))
      run(): void {
        throw new Error('boom');
      }
    }

    expect(() => new Job().run()).toThrow('boom');
    expect(reports[0]).toMatchObject({ method: 'run', ok: false });
  });

  it('trata null como un valor síncrono', () => {
    const reports: MeasureReport[] = [];

    class Service {
      @Measure((report) => reports.push(report))
      run(): null {
        return null;
      }
    }

    expect(new Service().run()).toBeNull();
    expect(reports).toMatchObject([{ method: 'run', ok: true }]);
  });

  it('mide métodos async hasta que resuelven o rechazan', async () => {
    const reports: MeasureReport[] = [];

    class Api {
      @Measure((r) => reports.push(r))
      async ok(): Promise<number> {
        return 1;
      }

      @Measure((r) => reports.push(r))
      async bad(): Promise<number> {
        throw new Error('x');
      }
    }

    await expect(new Api().ok()).resolves.toBe(1);
    await expect(new Api().bad()).rejects.toThrow('x');
    expect(reports.map((r) => [r.method, r.ok])).toEqual([
      ['ok', true],
      ['bad', false],
    ]);
  });
  it('reporta el éxito de un thenable sólo tras resolverlo', async () => {
    const reports: MeasureReport[] = [];

    class Service {
      @Measure((report) => reports.push(report))
      run() {
        return {
          then(onfulfilled: (value: string) => unknown): void {
            queueMicrotask(() => onfulfilled('resolved'));
          },
        };
      }
    }

    const result = new Service().run();

    expect(reports).toEqual([]);
    await expect(Promise.resolve(result)).resolves.toBe('resolved');
    expect(reports).toMatchObject([{ method: 'run', ok: true }]);
  });

  it('reporta el rechazo de un thenable y conserva la razón', async () => {
    const reports: MeasureReport[] = [];
    const reason = new Error('boom');

    class Service {
      @Measure((report) => reports.push(report))
      run() {
        return {
          then(
            _onfulfilled: (value: never) => unknown,
            onrejected: (error: unknown) => unknown,
          ): void {
            queueMicrotask(() => onrejected(reason));
          },
        };
      }
    }

    await expect(Promise.resolve(new Service().run())).rejects.toBe(reason);
    expect(reports).toMatchObject([{ method: 'run', ok: false }]);
  });
});
