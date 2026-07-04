import { describe, expect, it } from 'vitest';
import { Subject } from '../src/patterns/behavioral/observer';
import { On } from '../src/patterns/behavioral/on';

describe('@On', () => {
  it('suscribe el método al construir la instancia, con this correcto', () => {
    const bus = new Subject();
    const received: string[] = [];

    class Audit {
      prefix = 'audit:';

      @On(bus, 'user:created')
      onUser(payload: unknown): void {
        received.push(`${this.prefix}${String(payload)}`);
      }
    }

    bus.emit('user:created', 'antes'); // sin instancias: nadie escucha
    new Audit();
    bus.emit('user:created', 'Ana');

    expect(received).toEqual(['audit:Ana']);
  });

  it('cada instancia se suscribe por separado', () => {
    const bus = new Subject();
    let calls = 0;

    class Listener {
      @On(bus, 'tick')
      onTick(): void {
        calls++;
      }
    }

    new Listener();
    new Listener();
    bus.emit('tick', null);
    expect(calls).toBe(2);
  });

  it('un método puede escuchar varios eventos con decoradores apilados', () => {
    const bus = new Subject();
    const events: unknown[] = [];

    class Recorder {
      @On(bus, 'a')
      @On(bus, 'b')
      record(payload: unknown): void {
        events.push(payload);
      }
    }

    new Recorder();
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(events).toEqual([1, 2]);
  });
});
