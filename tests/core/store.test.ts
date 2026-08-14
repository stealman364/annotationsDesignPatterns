import { describe, expect, it } from 'vitest';
import { MemoryAsyncStore } from '../../src/core/async-store';
import { MemorySyncStore } from '../../src/core/sync-store';
import type { AsyncStore, SyncStore } from '../../src/core/store';

describe('MemorySyncStore', () => {
  it('implements the minimal synchronous CRUD contract', () => {
    const store: SyncStore<string, number> = new MemorySyncStore();

    expect(store.get('missing')).toBeUndefined();
    expect(store.has('missing')).toBe(false);

    store.set('answer', 42);

    expect(store.get('answer')).toBe(42);
    expect(store.has('answer')).toBe(true);
    expect(store.delete('answer')).toBe(true);
    expect(store.delete('answer')).toBe(false);
    expect(store.has('answer')).toBe(false);

    store.set('first', 1);
    store.set('second', 2);
    store.clear();

    expect(store.has('first')).toBe(false);
    expect(store.has('second')).toBe(false);
  });

  it('uses equal keys for the same entry and keeps stores isolated', () => {
    const firstStore: SyncStore<string, number> = new MemorySyncStore();
    const secondStore: SyncStore<string, number> = new MemorySyncStore();
    const firstKey = 'shared';
    const equalKey = `sha${'red'}`;

    firstStore.set(firstKey, 1);
    firstStore.set(equalKey, 2);

    expect(firstStore.get(firstKey)).toBe(2);
    expect(secondStore.get(firstKey)).toBeUndefined();
  });
});

describe('MemoryAsyncStore', () => {
  it('implements the minimal asynchronous CRUD contract', async () => {
    const store: AsyncStore<string, number> = new MemoryAsyncStore();

    await expect(store.get('missing')).resolves.toBeUndefined();
    await expect(store.has('missing')).resolves.toBe(false);

    await store.set('answer', 42);

    await expect(store.get('answer')).resolves.toBe(42);
    await expect(store.has('answer')).resolves.toBe(true);
    await expect(store.delete('answer')).resolves.toBe(true);
    await expect(store.delete('answer')).resolves.toBe(false);
    await expect(store.has('answer')).resolves.toBe(false);

    await store.set('first', 1);
    await store.set('second', 2);
    await store.clear();

    await expect(store.has('first')).resolves.toBe(false);
    await expect(store.has('second')).resolves.toBe(false);
  });

  it('uses equal keys for the same entry and keeps stores isolated', async () => {
    const firstStore: AsyncStore<string, number> = new MemoryAsyncStore();
    const secondStore: AsyncStore<string, number> = new MemoryAsyncStore();
    const firstKey = 'shared';
    const equalKey = `sha${'red'}`;

    await firstStore.set(firstKey, 1);
    await firstStore.set(equalKey, 2);

    await expect(firstStore.get(firstKey)).resolves.toBe(2);
    await expect(secondStore.get(firstKey)).resolves.toBeUndefined();
  });

  it('does not make concurrent read-modify-write sequences transactional', async () => {
    const store: AsyncStore<string, number> = new MemoryAsyncStore();
    await store.set('count', 0);

    const increment = async (): Promise<void> => {
      const current = await store.get('count');
      await Promise.resolve();
      await store.set('count', (current ?? 0) + 1);
    };

    await Promise.all([increment(), increment()]);

    expect(await store.get('count')).toBe(1);
  });
});
