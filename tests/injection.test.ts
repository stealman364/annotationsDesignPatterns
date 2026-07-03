import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  Container,
  Inject,
  Injectable,
  InjectionToken,
} from '../src/patterns/creational/injection';

interface Config {
  apiUrl: string;
}

describe('Container', () => {
  it('resuelve un useValue con su tipo', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    const config = container.resolve(CONFIG);
    expect(config.apiUrl).toBe('https://api');
    expectTypeOf(config).toEqualTypeOf<Config>();
  });

  it('useClass con scope singleton (por defecto) cachea la instancia', () => {
    const container = new Container();
    class Db {}
    container.register(Db, { useClass: Db });

    expect(container.resolve(Db)).toBe(container.resolve(Db));
  });

  it('scope transient crea una instancia por resolución', () => {
    const container = new Container();
    class Db {}
    container.register(Db, { useClass: Db, scope: 'transient' });

    expect(container.resolve(Db)).not.toBe(container.resolve(Db));
  });

  it('useFactory ejecuta la fábrica según el scope', () => {
    const container = new Container();
    const N = new InjectionToken<number>('n');
    let built = 0;
    container.register(N, { useFactory: () => ++built, scope: 'transient' });

    expect(container.resolve(N)).toBe(1);
    expect(container.resolve(N)).toBe(2);
  });

  it('lanza con mensaje claro si el token no está registrado', () => {
    const container = new Container();
    const MISSING = new InjectionToken<string>('missing');

    expect(() => container.resolve(MISSING)).toThrow('Token "missing" no registrado');
  });

  it('lanza al registrar dos veces el mismo token', () => {
    const container = new Container();
    const T = new InjectionToken<number>('t');
    container.register(T, { useValue: 1 });

    expect(() => container.register(T, { useValue: 2 })).toThrow('ya está registrado');
  });
});

describe('@Injectable + @Inject', () => {
  it('inyecta dependencias en campos al construir', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    @Injectable(container)
    class Repo {
      @Inject(container, CONFIG)
      config!: Config;
    }

    const repo = container.resolve(Repo);
    expect(repo.config.apiUrl).toBe('https://api');
  });

  it('@Injectable registra la clase como singleton por defecto', () => {
    const container = new Container();

    @Injectable(container)
    class Service {}

    expect(container.resolve(Service)).toBe(container.resolve(Service));
  });

  it('@Injectable con scope transient', () => {
    const container = new Container();

    @Injectable(container, { scope: 'transient' })
    class Service {}

    expect(container.resolve(Service)).not.toBe(container.resolve(Service));
  });

  it('cablea un grafo: servicio → repo → config', () => {
    const container = new Container();
    const CONFIG = new InjectionToken<Config>('config');
    container.register(CONFIG, { useValue: { apiUrl: 'https://api' } });

    @Injectable(container)
    class Repo {
      @Inject(container, CONFIG)
      config!: Config;
    }

    @Injectable(container)
    class Service {
      @Inject(container, Repo)
      repo!: Repo;
    }

    expect(container.resolve(Service).repo.config.apiUrl).toBe('https://api');
  });

  it('@Inject también funciona en clases instanciadas con new manual', () => {
    const container = new Container();
    const N = new InjectionToken<number>('n');
    container.register(N, { useValue: 42 });

    class Plain {
      @Inject(container, N)
      n!: number;
    }

    expect(new Plain().n).toBe(42);
  });
});
