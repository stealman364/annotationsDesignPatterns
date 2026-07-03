import { describe, expect, it } from 'vitest';
import { StrategyFor, StrategySelector } from '../src/patterns/strategy';

interface Compression {
  compress(data: string): string;
}

describe('StrategySelector + @StrategyFor', () => {
  it('cambia de estrategia en runtime con use()', () => {
    const compression = new StrategySelector<Compression>();

    @StrategyFor(compression, 'zip')
    class Zip implements Compression {
      compress(data: string): string {
        return `zip(${data})`;
      }
    }
    void Zip;

    @StrategyFor(compression, 'gzip')
    class Gzip implements Compression {
      compress(data: string): string {
        return `gzip(${data})`;
      }
    }
    void Gzip;

    compression.use('zip');
    expect(compression.current.compress('x')).toBe('zip(x)');

    compression.use('gzip');
    expect(compression.current.compress('x')).toBe('gzip(x)');
    expect(compression.keys().sort()).toEqual(['gzip', 'zip']);
  });

  it('lanza si se pide una estrategia sin seleccionar antes', () => {
    const selector = new StrategySelector<Compression>();
    expect(() => selector.current).toThrow('No hay estrategia activa');
  });

  it('lanza al seleccionar una clave no registrada', () => {
    const selector = new StrategySelector<Compression>();
    expect(() => selector.use('lz4')).toThrow('Estrategia "lz4" no registrada');
  });

  it('lanza al registrar una clave duplicada', () => {
    const selector = new StrategySelector<Compression>();
    selector.register('zip', { compress: (d) => d });
    expect(() => selector.register('zip', { compress: (d) => d })).toThrow('ya está registrada');
  });
});
