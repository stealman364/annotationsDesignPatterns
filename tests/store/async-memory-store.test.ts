import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AsyncMemoryStore } from '../../src/store';
import type { AtomicAsyncStore } from '../../src/store';

interface Gate {
  readonly promise: Promise<void>;
  release(): void;
}

function createGate(): Gate {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    release(): void {
      if (resolvePromise === undefined) {
        throw new Error('The gate was not initialized');
      }
      resolvePromise();
    },
  };
}

describe('AsyncMemoryStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('implements asynchronous CRUD with isolated state per instance', async () => {
    const first = new AsyncMemoryStore<string, number>();
    const second = new AsyncMemoryStore<string, number>();

    await expect(first.get('missing')).resolves.toBeUndefined();
    await expect(first.has('missing')).resolves.toBe(false);

    await first.set('answer', 42);

    await expect(first.get('answer')).resolves.toBe(42);
    await expect(second.get('answer')).resolves.toBeUndefined();
    await expect(first.delete('answer')).resolves.toBe(true);
    await expect(first.delete('answer')).resolves.toBe(false);

    await first.set('first', 1);
    await first.set('second', 2);
    await first.clear();

    await expect(first.has('first')).resolves.toBe(false);
    await expect(first.has('second')).resolves.toBe(false);
  });

  it('expires TTL entries lazily on reads without a permanent timer', async () => {
    vi.useFakeTimers();
    const store = new AsyncMemoryStore<string, string>();

    await store.set('session', 'active', { ttlMs: 100 });
    expect(vi.getTimerCount()).toBe(0);
    await expect(store.get('session')).resolves.toBe('active');

    await vi.advanceTimersByTimeAsync(100);

    await expect(store.get('session')).resolves.toBeUndefined();
    await expect(store.has('session')).resolves.toBe(false);
  });

  it('removes expired entries through explicit cleanup', async () => {
    vi.useFakeTimers();
    const store = new AsyncMemoryStore<string, string>();

    await store.set('short-lived', 'value', { ttlMs: 10 });
    await store.set('persistent', 'value');
    await vi.advanceTimersByTimeAsync(10);

    await store.cleanup();

    await expect(store.get('short-lived')).resolves.toBeUndefined();
    await expect(store.get('persistent')).resolves.toBe('value');
  });

  it('serializes asynchronous updates to the same key atomically', async () => {
    const store = new AsyncMemoryStore<string, number>();
    const firstEntered = createGate();
    const releaseFirst = createGate();
    let secondUpdaterStarted = false;

    await store.set('count', 0);
    const first = store.update('count', async (current) => {
      firstEntered.release();
      await releaseFirst.promise;
      return (current ?? 0) + 1;
    });

    await firstEntered.promise;

    const second = store.update('count', (current) => {
      secondUpdaterStarted = true;
      return (current ?? 0) + 1;
    });

    await Promise.resolve();
    expect(secondUpdaterStarted).toBe(false);

    releaseFirst.release();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    await expect(store.get('count')).resolves.toBe(2);
  });

  it('declares its local atomic, TTL, consistency, and feature capabilities', () => {
    const store = new AsyncMemoryStore<string, number>();

    expect(store.capabilities).toEqual({
      atomic: true,
      consistency: 'strong',
      ttl: true,
      isolation: 'instance',
      network: 'none',
      locks: true,
      circuitBreaker: true,
    });
    expectTypeOf(store).toMatchTypeOf<AtomicAsyncStore<string, number>>();
  });
});
