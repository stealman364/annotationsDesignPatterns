import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncMemoryStore } from '../../src/store/async-memory-store';

interface Gate {
  readonly promise: Promise<void>;
  release(): void;
}

function createGate(): Gate {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, release: resolvePromise };
}

describe('AsyncMemoryStore mutation ordering', () => {
  afterEach(() => vi.useRealTimers());

  it('serializes set after a pending update and resolves set only when committed', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('count', 1);
    const update = store.update('count', async (value) => {
      entered.release();
      await release.promise;
      return (value ?? 0) + 1;
    });
    await entered.promise;

    let setFinished = false;
    const set = store.set('count', 10).then(() => {
      setFinished = true;
    });
    await Promise.resolve();
    expect(setFinished).toBe(false);

    release.release();
    await expect(update).resolves.toBe(2);
    await set;
    await expect(store.get('count')).resolves.toBe(10);
  });

  it('keeps reads non-blocking while an update is pending, including reads inside its updater', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('count', 1);
    const update = store.update('count', async () => {
      entered.release();
      await release.promise;
      expect(await store.has('count')).toBe(true);
      expect(await store.get('count')).toBe(1);
      return 2;
    });
    await entered.promise;
    const read = store.get('count');
    await expect(read).resolves.toBe(1);
    release.release();
    await update;
    await expect(store.get('count')).resolves.toBe(2);
  });

  it('serializes delete after a pending update and leaves the key absent', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('value', 1);
    const update = store.update('value', async () => {
      entered.release();
      await release.promise;
      return 2;
    });
    await entered.promise;
    let deleteFinished = false;
    const deletion = store.delete('value').then((deleted) => {
      deleteFinished = true;
      return deleted;
    });
    await Promise.resolve();
    expect(deleteFinished).toBe(false);

    release.release();
    await expect(update).resolves.toBe(2);
    await expect(deletion).resolves.toBe(true);
    await expect(store.has('value')).resolves.toBe(false);
  });

  it('makes clear wait for every operation admitted before its barrier', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('slow', 0);
    const update = store.update('slow', async () => {
      entered.release();
      await release.promise;
      return 1;
    });
    await entered.promise;
    const setOtherKey = store.set('other', 2);
    const clear = store.clear();

    release.release();
    await Promise.all([update, setOtherKey, clear]);
    await expect(store.has('slow')).resolves.toBe(false);
    await expect(store.has('other')).resolves.toBe(false);
  });

  it('holds operations on both existing and new keys until clear completes', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('held', 0);
    const update = store.update('held', async () => {
      entered.release();
      await release.promise;
      return 1;
    });
    await entered.promise;
    const clear = store.clear();
    let existingSetFinished = false;
    let newSetFinished = false;
    const existingSet = store.set('held', 10).then(() => {
      existingSetFinished = true;
    });
    const newSet = store.set('new', 20).then(() => {
      newSetFinished = true;
    });
    await Promise.resolve();
    expect(existingSetFinished).toBe(false);
    expect(newSetFinished).toBe(false);

    release.release();
    await Promise.all([update, clear, existingSet, newSet]);
    await expect(store.get('held')).resolves.toBe(10);
    await expect(store.get('new')).resolves.toBe(20);
  });

  it('preserves the order of multiple clear barriers and surrounding writes', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('slow', 0);
    const update = store.update('slow', async () => {
      entered.release();
      await release.promise;
      return 1;
    });
    await entered.promise;

    const firstClear = store.clear();
    const betweenClears = store.set('between', 2);
    const secondClear = store.clear();
    const afterClears = store.set('after', 3);
    release.release();

    await Promise.all([update, firstClear, betweenClears, secondClear, afterClears]);
    await expect(store.has('slow')).resolves.toBe(false);
    await expect(store.has('between')).resolves.toBe(false);
    await expect(store.get('after')).resolves.toBe(3);
  });

  it('allows a later mutation after an updater rejects', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('value', 1);
    const rejected = store.update('value', async () => {
      entered.release();
      await release.promise;
      throw new Error('updater failed');
    });
    await entered.promise;
    const set = store.set('value', 5);
    release.release();

    await expect(rejected).rejects.toThrow('updater failed');
    await set;
    await expect(store.get('value')).resolves.toBe(5);
  });

  it('runs updates for distinct keys concurrently', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const release = createGate();
    let started = 0;
    await Promise.all([store.set('a', 1), store.set('b', 2)]);
    const update = (key: string) =>
      store.update(key, async (value) => {
        started += 1;
        await release.promise;
        return (value ?? 0) + 1;
      });
    const first = update('a');
    const second = update('b');
    await vi.waitFor(() => expect(started).toBe(2));
    release.release();
    await expect(Promise.all([first, second])).resolves.toEqual([2, 3]);
  });

  it('starts an update TTL at commit and orders cleanup after that update', async () => {
    vi.useFakeTimers();
    const store = new AsyncMemoryStore<string, number>();
    const entered = createGate();
    const release = createGate();
    await store.set('value', 1, { ttlMs: 10 });
    const update = store.update(
      'value',
      async () => {
        entered.release();
        await release.promise;
        return 2;
      },
      { ttlMs: 100 },
    );
    await entered.promise;
    const cleanup = store.cleanup();
    await vi.advanceTimersByTimeAsync(20);
    release.release();

    await Promise.all([update, cleanup]);
    await expect(store.get('value')).resolves.toBe(2);
    await vi.advanceTimersByTimeAsync(100);
    await expect(store.get('value')).resolves.toBeUndefined();
  });
});
