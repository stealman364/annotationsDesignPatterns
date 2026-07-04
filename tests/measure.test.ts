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
});
