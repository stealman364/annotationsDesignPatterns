import { describe, expect, it } from 'vitest';
import { Log } from '../src/patterns/utility/log';

describe('@Log', () => {
  it('registra la llamada con argumentos y el éxito con duración', () => {
    const lines: string[] = [];

    class Greeter {
      @Log({ logger: (m) => lines.push(m) })
      greet(name: string): string {
        return `Hola, ${name}`;
      }
    }

    expect(new Greeter().greet('Ana')).toBe('Hola, Ana');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('→ greet("Ana")');
    expect(lines[1]).toMatch(/^← greet ✓ \d+ ms$/);
  });

  it('registra el error con duración y lo propaga', () => {
    const lines: string[] = [];

    class Job {
      @Log({ logger: (m) => lines.push(m) })
      run(): void {
        throw new Error('boom');
      }
    }

    expect(() => new Job().run()).toThrow('boom');
    expect(lines[1]).toMatch(/^← run ✗ \d+ ms: Error: boom$/);
  });

  it('soporta métodos async (el log final llega tras resolver)', async () => {
    const lines: string[] = [];

    class Api {
      @Log({ logger: (m) => lines.push(m) })
      async fetch(id: number): Promise<string> {
        return `dato-${id}`;
      }
    }

    await expect(new Api().fetch(7)).resolves.toBe('dato-7');
    expect(lines[0]).toBe('→ fetch(7)');
    expect(lines[1]).toMatch(/^← fetch ✓ \d+ ms$/);
  });

  it('label sustituye el nombre y los argumentos no serializables no rompen', () => {
    const lines: string[] = [];

    class Svc {
      @Log({ logger: (m) => lines.push(m), label: 'Svc.process' })
      process(fn: () => void): number {
        void fn;
        return 1;
      }
    }

    expect(new Svc().process(() => {})).toBe(1);
    expect(lines[0]).toMatch(/^→ Svc\.process\(/);
  });
});
