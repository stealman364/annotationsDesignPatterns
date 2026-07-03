import { describe, expect, it } from 'vitest';
import { Once } from '../src/patterns/utility/once';

describe('@Once', () => {
  it('ejecuta el método una sola vez y devuelve siempre el primer resultado', () => {
    let executions = 0;

    class Setup {
      @Once
      init(label: string): string {
        executions++;
        return `init:${label}`;
      }
    }

    const s = new Setup();
    expect(s.init('a')).toBe('init:a');
    expect(s.init('b')).toBe('init:a');
    expect(executions).toBe(1);
  });

  it('cada instancia ejecuta su propia vez', () => {
    let executions = 0;

    class Setup {
      @Once
      init(): number {
        return ++executions;
      }
    }

    const a = new Setup();
    const b = new Setup();
    expect(a.init()).toBe(1);
    expect(b.init()).toBe(2);
    expect(a.init()).toBe(1);
  });

  it('cachea también resultados undefined', () => {
    let executions = 0;

    class Job {
      @Once
      run(): undefined {
        executions++;
        return undefined;
      }
    }

    const j = new Job();
    expect(j.run()).toBeUndefined();
    expect(j.run()).toBeUndefined();
    expect(executions).toBe(1);
  });
});
