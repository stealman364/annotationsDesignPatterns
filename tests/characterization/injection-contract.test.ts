import { describe, expect, it } from 'vitest';
import {
  CircularDependencyError,
  Container,
  InjectionToken,
} from '../../src/patterns/creational/injection';

describe('caracterización del contrato actual de Container', () => {
  it('rechaza registros duplicados para el mismo token', () => {
    const container = new Container();
    const token = new InjectionToken<number>('answer');
    container.register(token, { useValue: 42 });

    expect(() => container.register(token, { useValue: 43 })).toThrow('ya está registrado');
  });

  it('rechaza resoluciones de tokens no registrados', () => {
    const container = new Container();
    const token = new InjectionToken<number>('missing');

    expect(() => container.resolve(token)).toThrow('Token "missing" no registrado');
  });

  it('reutiliza providers singleton por defecto', () => {
    const container = new Container();
    const token = new InjectionToken<object>('singleton');
    container.register(token, { useFactory: () => ({}) });

    expect(container.resolve(token)).toBe(container.resolve(token));
  });

  it('crea una instancia por resolución para providers transient', () => {
    const container = new Container();
    const token = new InjectionToken<object>('transient');
    container.register(token, { useFactory: () => ({}), scope: 'transient' });

    expect(container.resolve(token)).not.toBe(container.resolve(token));
  });

  it('rechaza un ciclo de factories con un error y ruta expl\u00edcitos', () => {
    const container = new Container();
    const A = new InjectionToken<object>('A');
    const B = new InjectionToken<object>('B');
    container.register(A, { useFactory: () => container.resolve(B) });
    container.register(B, { useFactory: () => container.resolve(A) });

    expect(() => container.resolve(A)).toThrow(CircularDependencyError);
    expect(() => container.resolve(A)).toThrow('A -> B -> A');
  });
});
