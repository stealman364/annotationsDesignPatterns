import { describe, expect, it } from 'vitest';
import { IterableOver, type WithIterator } from '../src/patterns/behavioral/iterable-over';

describe('@IterableOver', () => {
  it('hace la clase iterable sobre la propiedad indicada', () => {
    @IterableOver('items')
    class Playlist {
      items = ['a', 'b', 'c'];
    }

    const p = new Playlist() as WithIterator<Playlist, string>;
    expect([...p]).toEqual(['a', 'b', 'c']);

    const seen: string[] = [];
    for (const song of p) {
      seen.push(song);
    }
    expect(seen).toEqual(['a', 'b', 'c']);
  });

  it('itera el contenido actual de la propiedad', () => {
    @IterableOver('items')
    class Bag {
      items: number[] = [];
    }

    const bag = new Bag() as WithIterator<Bag, number>;
    bag.items.push(1, 2);
    expect([...bag]).toEqual([1, 2]);
    bag.items.push(3);
    expect([...bag]).toEqual([1, 2, 3]);
  });

  it('lanza con mensaje claro si la propiedad no es iterable', () => {
    @IterableOver('value')
    class Box {
      value = 42;
    }

    const box = new Box() as WithIterator<Box, never>;
    expect(() => [...box]).toThrow('La propiedad "value" no es iterable');
  });
});
