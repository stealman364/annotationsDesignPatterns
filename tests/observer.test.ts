import { describe, expect, expectTypeOf, it } from 'vitest';
import { Emits, Subject } from '../src/patterns/behavioral/observer';

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

  it('emite null como un valor síncrono', () => {
    class Service extends Subject {
      @Emits('done')
      run(): null {
        return null;
      }
    }

    const service = new Service();
    const received: unknown[] = [];
    service.on('done', (payload) => received.push(payload));

    expect(service.run()).toBeNull();
    expect(received).toEqual([null]);
  });

  it('emite el valor resuelto cuando el método es async', async () => {
    class UserService extends Subject {
      @Emits('user:created')
      async create(name: string): Promise<{ name: string }> {
        return { name };
      }
    }

    const service = new UserService();
    const received: unknown[] = [];
    service.on('user:created', (payload) => received.push(payload));

    const result = await service.create('Ana');

    expect(result).toEqual({ name: 'Ana' });
    expect(received).toEqual([{ name: 'Ana' }]);
  });

  it('no emite si la promesa rechaza', async () => {
    class Failing extends Subject {
      @Emits('done')
      async run(): Promise<void> {
        throw new Error('boom');
      }
    }

    const f = new Failing();
    let notified = false;
    f.on('done', () => {
      notified = true;
    });

    await expect(f.run()).rejects.toThrow('boom');
    expect(notified).toBe(false);
  });
});

describe('@Emits with custom thenables', () => {
  it('emite el valor de un thenable tras resolverlo', async () => {
    class Service extends Subject {
      @Emits('done')
      run() {
        return {
          then(onfulfilled: (value: string) => unknown): void {
            queueMicrotask(() => onfulfilled('resolved'));
          },
        };
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

  it('no emite cuando un thenable rechaza y conserva la razón', async () => {
    const reason = new Error('boom');

    class Failing extends Subject {
      @Emits('done')
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

    const service = new Failing();
    const received: unknown[] = [];
    service.on('done', (payload) => received.push(payload));

    await expect(Promise.resolve(service.run())).rejects.toBe(reason);
    expect(received).toEqual([]);
  });
});

describe('Subject tipado', () => {
  interface User {
    name: string;
  }

  it('los payloads llevan el tipo declarado para cada evento', () => {
    const subject = new Subject<{ 'user:created': User; count: number }>();
    const names: string[] = [];

    subject.on('user:created', (user) => names.push(user.name));
    subject.emit('user:created', { name: 'Ana' });
    subject.emit('count', 3);

    expect(names).toEqual(['Ana']);
    expectTypeOf(subject.on<'count'>)
      .parameter(1)
      .toEqualTypeOf<(payload: number) => void>();
    expectTypeOf(subject.emit<'user:created'>)
      .parameter(1)
      .toEqualTypeOf<User>();
  });

  it('@Emits funciona sobre una subclase tipada', () => {
    class UserService extends Subject<{ 'user:created': User }> {
      @Emits('user:created')
      create(name: string): User {
        return { name };
      }
    }

    const service = new UserService();
    const received: User[] = [];
    service.on('user:created', (user) => received.push(user));

    service.create('Bea');
    expect(received).toEqual([{ name: 'Bea' }]);
  });
});
