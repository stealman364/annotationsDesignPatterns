import { describe, expect, it } from 'vitest';
import { Emits, Subject } from '../src/patterns/observer';

describe('Subject', () => {
  it('notifica a los suscriptores del evento', () => {
    const subject = new Subject();
    const received: unknown[] = [];
    subject.on('saved', (payload) => received.push(payload));

    subject.emit('saved', { id: 1 });

    expect(received).toEqual([{ id: 1 }]);
  });

  it('no notifica eventos distintos ni suscriptores dados de baja', () => {
    const subject = new Subject();
    const received: unknown[] = [];
    const unsubscribe = subject.on('saved', (payload) => received.push(payload));
    subject.on('deleted', () => received.push('no debería llegar por saved'));

    subject.emit('saved', 'primero');
    unsubscribe();
    subject.emit('saved', 'segundo');

    expect(received).toEqual(['primero']);
  });
});

describe('@Emits', () => {
  it('emite el evento con el valor de retorno tras ejecutar el método', () => {
    class UserService extends Subject {
      @Emits('user:created')
      create(name: string): { name: string } {
        return { name };
      }
    }

    const service = new UserService();
    const received: unknown[] = [];
    service.on('user:created', (payload) => received.push(payload));

    const result = service.create('Ana');

    expect(result).toEqual({ name: 'Ana' });
    expect(received).toEqual([{ name: 'Ana' }]);
  });

  it('no emite si el método lanza', () => {
    class Failing extends Subject {
      @Emits('done')
      run(): void {
        throw new Error('boom');
      }
    }

    const f = new Failing();
    let notified = false;
    f.on('done', () => {
      notified = true;
    });

    expect(() => f.run()).toThrow('boom');
    expect(notified).toBe(false);
  });
});
