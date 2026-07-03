import { describe, expect, expectTypeOf, it } from 'vitest';
import { Adapt, type Adapted } from '../src/patterns/structural/adapt';

describe('@Adapt', () => {
  it('expone los métodos existentes bajo los alias indicados', () => {
    @Adapt({ send: 'postMessage', close: 'disconnect' })
    class LegacySocket {
      log: string[] = [];
      postMessage(data: string): void {
        this.log.push(`post:${data}`);
      }
      disconnect(): void {
        this.log.push('bye');
      }
    }

    const socket = new LegacySocket() as Adapted<
      LegacySocket,
      { send: 'postMessage'; close: 'disconnect' }
    >;

    socket.send('hola');
    socket.close();
    expect(socket.log).toEqual(['post:hola', 'bye']);
  });

  it('lanza en tiempo de decoración si el método origen no existe', () => {
    expect(() => {
      @Adapt({ send: 'noExiste' })
      class Broken {}
      void Broken;
    }).toThrow('No existe el método "noExiste"');
  });

  it('el tipo Adapted expone los alias con la firma del método original', () => {
    class Legacy {
      postMessage(data: string): number {
        return data.length;
      }
    }

    type Modern = Adapted<Legacy, { send: 'postMessage' }>;
    expectTypeOf<Modern['send']>().toEqualTypeOf<Legacy['postMessage']>();
    expectTypeOf<Modern['postMessage']>().toEqualTypeOf<Legacy['postMessage']>();
  });
});
