import { describe, expect, expectTypeOf, it } from 'vitest';
import { Emits, Subject } from '../src/patterns/behavioral/observer';
import { On } from '../src/patterns/behavioral/on';

type Selection =
  Readonly<{ kind: 'created'; id: number }> | Readonly<{ kind: 'deleted'; id: number }>;
type Events = { message: string; count: number; done: void; selection: Selection };
interface InterfaceEvents {
  readonly created: Readonly<{ id: number }>;
  readonly deleted: string;
}

// Not executed: these negative cases are checked by npm run typecheck.
function invalidObserverDeclarations(): void {
  const bus = new Subject<Events>();
  class InvalidListeners {
    // @ts-expect-error unknown event name
    @On(bus, 'missing')
    unknownEvent(value: unknown): void {
      void value;
    }

    // @ts-expect-error count emits number, not string
    @On(bus, 'count')
    wrongPayload(value: string): void {
      void value;
    }

    // @ts-expect-error a string listener cannot require only one literal
    @On(bus, 'message')
    narrowPayload(value: 'only-this'): void {
      void value;
    }
  }
  class InvalidEmitters extends Subject<Events> {
    // @ts-expect-error unknown event name
    @Emits('missing')
    unknownEvent(): string {
      return 'value';
    }

    // @ts-expect-error message payload must be string
    @Emits('message')
    wrongPayload(): number {
      return 1;
    }

    // @ts-expect-error resolved count payload must be number
    @Emits('count')
    async wrongAsyncPayload(): Promise<string> {
      return 'wrong';
    }

    // @ts-expect-error resolved thenable count payload must be number
    @Emits('count')
    wrongThenablePayload(): PromiseLike<string> {
      return Promise.resolve('wrong');
    }

    // @ts-expect-error a union that includes another event's payload is unsafe
    @Emits('message')
    mixedPayload(): string | number {
      return 1;
    }
  }
  void InvalidListeners;
  void InvalidEmitters;
}
void invalidObserverDeclarations;

function invalidInterfaceObserverDeclarations(): void {
  const bus = new Subject<InterfaceEvents>();
  class InterfaceBus extends Subject<InterfaceEvents> {}
  const subclass = new InterfaceBus();
  class InvalidListener {
    // @ts-expect-error named interfaces must retain closed event keys
    @On(bus, 'missing')
    wrongEvent(value: unknown): void {
      void value;
    }

    // @ts-expect-error named-interface payload must match the selected event
    @On(bus, 'created')
    wrongPayload(value: number): void {
      void value;
    }

    // @ts-expect-error subclass inference must retain the selected interface payload
    @On(subclass, 'created')
    wrongSubclassPayload(value: number): void {
      void value;
    }

    // @ts-expect-error a narrow literal is not a listener for every deleted string
    @On(subclass, 'deleted')
    narrowSubclassPayload(value: 'only-one'): void {
      void value;
    }

    // @ts-expect-error explicit broad this must not loosen listener payload checking
    @On(subclass, 'created')
    wrongBroadReceiver(this: object, value: number): void {
      void value;
    }

    // @ts-expect-error neither member of this payload union accepts deleted strings
    @On(subclass, 'deleted')
    wrongUnion(value: InterfaceEvents['created'] | number): void {
      void value;
    }

    // @ts-expect-error subclass inference must retain closed event names
    @On(subclass, 'missing')
    wrongSubclassEvent(value: unknown): void {
      void value;
    }
  }
  class InvalidEmitter extends Subject<InterfaceEvents> {
    // @ts-expect-error the deleted payload cannot be emitted under created
    @Emits('created')
    wrongPayload(): string {
      return 'wrong';
    }

    // @ts-expect-error a broad explicit this cannot bypass the class event map
    @Emits('deleted')
    wrongBroadReceiver(this: Subject): number {
      return 1;
    }

    // @ts-expect-error a broad explicit this cannot invent an event name
    @Emits('missing')
    wrongBroadReceiverEvent(this: Subject): string {
      return 'wrong';
    }
  }
  const tuple = new Subject<readonly [string, number]>();
  // @ts-expect-error tuple event payloads remain associated with their indices
  tuple.emit('0', 1);
  // @ts-expect-error the second tuple event cannot receive the first payload
  tuple.on('1', (value: string) => {
    void value;
  });
  void [InvalidListener, InvalidEmitter];
}
void invalidInterfaceObserverDeclarations;

describe('observer decorator type contracts', () => {
  it('accepts a named interface without requiring an index signature', async () => {
    class Service extends Subject<InterfaceEvents> {
      @Emits('created')
      create(id: number): Readonly<{ id: number }> {
        return { id };
      }

      @Emits('deleted')
      async remove(id: string): Promise<string> {
        return id;
      }
    }
    const service = new Service();
    const received: Array<InterfaceEvents[keyof InterfaceEvents]> = [];
    class Listener {
      @On(service, 'created')
      created(user: InterfaceEvents['created']): void {
        received.push(user);
      }

      @On(service, 'deleted')
      deleted(id: string): void {
        received.push(id);
      }

      @On(service, 'created')
      async acceptsReadonlySubtype(value: Readonly<{ id: number }>): Promise<void> {
        void value;
      }

      @On(service, 'deleted')
      noArgument(): void {}
    }
    const explicitFactory = On<InterfaceEvents, 'created'>(service, 'created');
    class BroadListener {
      @explicitFactory
      receive(value: unknown): void {
        void value;
      }
    }
    new Listener();
    new BroadListener();
    expect(service.create(1)).toEqual({ id: 1 });
    await expect(service.remove('one')).resolves.toBe('one');
    expect(received).toEqual([{ id: 1 }, 'one']);
    expectTypeOf(service.create).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(service.remove).returns.toEqualTypeOf<Promise<string>>();
  });
  it('infers event names and accepts exact, broader, and no-argument listeners', () => {
    const bus = new Subject<Events>();
    const received: unknown[] = [];
    class Listeners {
      @On(bus, 'message')
      message(value: string): void {
        received.push(value);
      }

      @On(bus, 'count')
      broader(value: unknown): void {
        received.push(value);
      }

      @On(bus, 'done')
      noArgs(): void {
        received.push('done');
      }

      @On(bus, 'selection')
      readonlyUnion(value: Selection): void {
        received.push(value);
      }
    }
    new Listeners();
    bus.emit('message', 'hello');
    bus.emit('count', 3);
    bus.emit('done', undefined);
    bus.emit('selection', { kind: 'created', id: 1 });
    expect(received).toEqual(['hello', 3, 'done', { kind: 'created', id: 1 }]);
  });

  it('validates synchronous, async, thenable and void return payloads without changing return types', async () => {
    class Service extends Subject<Events> {
      @Emits('message')
      message(): string {
        return 'sync';
      }

      @Emits('count')
      async count(): Promise<number> {
        return 2;
      }

      @Emits('message')
      thenable(): PromiseLike<string> {
        return {
          then: (onfulfilled, onrejected) =>
            Promise.resolve('thenable').then(onfulfilled, onrejected),
        };
      }

      @Emits('done')
      done(): void {}

      @Emits('selection')
      selection(): Readonly<{ kind: 'created'; id: 1 }> {
        return { kind: 'created', id: 1 };
      }
    }
    const service = new Service();
    const received: unknown[] = [];
    service.on('message', (value) => received.push(value));
    service.on('count', (value) => received.push(value));
    service.on('done', (value) => received.push(value));
    service.on('selection', (value) => received.push(value));
    expectTypeOf(service.message).returns.toEqualTypeOf<string>();
    expectTypeOf(service.count).returns.toEqualTypeOf<Promise<number>>();
    expectTypeOf(service.thenable).returns.toEqualTypeOf<PromiseLike<string>>();
    expect(service.message()).toBe('sync');
    await expect(service.count()).resolves.toBe(2);
    await expect(Promise.resolve(service.thenable())).resolves.toBe('thenable');
    service.done();
    service.selection();
    expect(received).toEqual(['sync', 2, 'thenable', undefined, { kind: 'created', id: 1 }]);
  });

  it('retains generic strings and unknown payloads for an untyped Subject', () => {
    const bus = new Subject();
    const received: unknown[] = [];
    class Listener {
      @On(bus, 'arbitrary:event')
      receive(value: unknown): void {
        received.push(value);
      }
    }
    class Service extends Subject {
      @Emits('arbitrary:event')
      done(): void {}
    }
    new Listener();
    bus.emit('arbitrary:event', { value: 1 });
    const service = new Service();
    service.on('arbitrary:event', (value) => received.push(value));
    service.done();
    expect(received).toEqual([{ value: 1 }, undefined]);
  });
});
