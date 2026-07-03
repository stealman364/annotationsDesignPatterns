import { describe, expect, it } from 'vitest';
import { HandlerChain, HandlerFor, type Handler } from '../src/patterns/behavioral/handler-chain';

describe('HandlerChain + @HandlerFor', () => {
  it('la petición la procesa el primer handler que puede, por prioridad', () => {
    const chain = new HandlerChain<number, string>();

    @HandlerFor(chain, 2)
    class AnyNumber implements Handler<number, string> {
      canHandle(): boolean {
        return true;
      }
      handle(n: number): string {
        return `generic:${n}`;
      }
    }
    void AnyNumber;

    @HandlerFor(chain, 1)
    class Negative implements Handler<number, string> {
      canHandle(n: number): boolean {
        return n < 0;
      }
      handle(n: number): string {
        return `negative:${n}`;
      }
    }
    void Negative;

    expect(chain.dispatch(-5)).toBe('negative:-5');
    expect(chain.dispatch(7)).toBe('generic:7');
  });

  it('lanza si ningún handler acepta la petición', () => {
    const chain = new HandlerChain<string, string>();

    @HandlerFor(chain)
    class OnlyHello implements Handler<string, string> {
      canHandle(request: string): boolean {
        return request === 'hola';
      }
      handle(): string {
        return 'ok';
      }
    }
    void OnlyHello;

    expect(() => chain.dispatch('adiós')).toThrow(
      'Ningún handler de la cadena pudo procesar la petición',
    );
  });

  it('register() también funciona sin decorador', () => {
    const chain = new HandlerChain<string, number>();
    chain.register({ canHandle: () => true, handle: (s) => s.length });
    expect(chain.dispatch('abc')).toBe(3);
  });
});
