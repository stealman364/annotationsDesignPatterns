import { describe, expect, it } from 'vitest';
import { Snapshot, SnapshotHistory } from '../src/patterns/behavioral/snapshot';

describe('SnapshotHistory + @Snapshot', () => {
  it('guarda el estado antes de cada mutación y lo restaura en orden LIFO', () => {
    const history = new SnapshotHistory();

    class Editor {
      content = '';

      @Snapshot(history)
      write(text: string): void {
        this.content += text;
      }
    }

    const editor = new Editor();
    editor.write('hola');
    editor.write(' mundo');
    expect(editor.content).toBe('hola mundo');
    expect(history.size).toBe(2);

    history.restoreLast();
    expect(editor.content).toBe('hola');
    history.restoreLast();
    expect(editor.content).toBe('');
    expect(history.size).toBe(0);
  });

  it('restaura la instancia correcta cuando hay varias', () => {
    const history = new SnapshotHistory();

    class Counter {
      value = 0;

      @Snapshot(history)
      set(value: number): void {
        this.value = value;
      }
    }

    const a = new Counter();
    const b = new Counter();
    a.set(1);
    b.set(9);

    history.restoreLast(); // deshace b.set(9)
    expect(b.value).toBe(0);
    expect(a.value).toBe(1);
  });

  it('lanza al restaurar con el historial vacío', () => {
    const history = new SnapshotHistory();
    expect(() => history.restoreLast()).toThrow('No hay snapshots que restaurar');
  });
});
