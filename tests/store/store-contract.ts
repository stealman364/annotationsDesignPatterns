import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireAtomicStore, StoreCapabilityError } from '../../src/store';
import type { AsyncStore, AtomicAsyncStore, StoreCapabilities } from '../../src/store';

export type AtomicStoreFactory = () => AtomicAsyncStore<string, number>;

export interface AsyncAtomicStoreContractOptions {
  readonly ttl: boolean;
}

interface Gate {
  readonly promise: Promise<void>;
  release(): void;
}

function createGate(): Gate {
  let resolveGate: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolveGate = resolve;
  });

  return {
    promise,
    release(): void {
      if (resolveGate === undefined) {
        throw new Error('The gate was not initialized');
      }
      resolveGate();
    },
  };
}

function createMinimalAsyncStore(): AsyncStore<string, number> {
  return {
    async get(): Promise<number | undefined> {
      return undefined;
    },
    async has(): Promise<boolean> {
      return false;
    },
    async set(): Promise<void> {
      // A valid minimal store deliberately has no atomic update capability.
    },
    async delete(): Promise<boolean> {
      return false;
    },
    async clear(): Promise<void> {
      // A valid minimal store deliberately has no atomic update capability.
    },
  };
}

function createAtomicStoreWithCapabilities(
  capabilities: AtomicAsyncStore<string, number>['capabilities'],
): AtomicAsyncStore<string, number> {
  return {
    capabilities,
    async get(): Promise<number | undefined> {
      return undefined;
    },
    async has(): Promise<boolean> {
      return false;
    },
    async set(): Promise<void> {
      // Capability tests only need a valid atomic adapter shape.
    },
    async delete(): Promise<boolean> {
      return false;
    },
    async clear(): Promise<void> {
      // Capability tests only need a valid atomic adapter shape.
    },
    async update(_key, updater): Promise<number> {
      return updater(undefined);
    },
  };
}

const atomicCapabilitiesWithoutLocks = {
  atomic: true,
  consistency: 'strong',
  ttl: true,
  isolation: 'instance',
  network: 'none',
  locks: false,
  circuitBreaker: true,
} as const satisfies StoreCapabilities;

const atomicCapabilitiesWithoutCircuitBreaker = {
  atomic: true,
  consistency: 'strong',
  ttl: true,
  isolation: 'instance',
  network: 'none',
  locks: true,
  circuitBreaker: false,
} as const satisfies StoreCapabilities;

/** Runs the reusable contract required from an in-process atomic async store. */
export function describeAsyncAtomicStoreContract(
  name: string,
  createStore: AtomicStoreFactory,
  options: AsyncAtomicStoreContractOptions,
): void {
  describe(`${name} async atomic store contract`, () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('distinguishes absent values from stored falsy values', async () => {
      const store = createStore();

      await store.set('zero', 0);

      await expect(store.get('missing')).resolves.toBeUndefined();
      await expect(store.get('zero')).resolves.toBe(0);
      await expect(store.has('zero')).resolves.toBe(true);
    });

    it('expires a configured TTL lazily without a permanent timer', async () => {
      vi.useFakeTimers();
      const store = createStore();

      expect(store.capabilities.ttl).toBe(options.ttl);
      if (!options.ttl) {
        return;
      }

      await store.set('short-lived', 1, { ttlMs: 10 });
      expect(vi.getTimerCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(10);

      await expect(store.get('short-lived')).resolves.toBeUndefined();
      await expect(store.has('short-lived')).resolves.toBe(false);
    });

    it('serializes concurrent updates to one key', async () => {
      const store = createStore();
      const firstEntered = createGate();
      const releaseFirst = createGate();
      let secondUpdaterStarted = false;

      await store.set('counter', 0);
      const first = store.update('counter', async (current) => {
        firstEntered.release();
        await releaseFirst.promise;
        return (current ?? 0) + 1;
      });

      await firstEntered.promise;
      const second = store.update('counter', (current) => {
        secondUpdaterStarted = true;
        return (current ?? 0) + 1;
      });

      await Promise.resolve();
      expect(secondUpdaterStarted).toBe(false);

      releaseFirst.release();
      await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
      await expect(store.get('counter')).resolves.toBe(2);
    });
  });
}

/** Verifies the failure consumers receive before using a non-atomic adapter. */
export function describeAtomicStoreCapabilityContract(
  name: string,
  createStore: AtomicStoreFactory,
): void {
  describe(`${name} atomic capability contract`, () => {
    it('rejects a minimal store with an actionable lock capability error', () => {
      const nonAtomicStore = createMinimalAsyncStore();

      try {
        requireAtomicStore(nonAtomicStore, 'lock');
        throw new Error('Expected an atomic store requirement to reject this adapter');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreCapabilityError);
        expect(error).toMatchObject({
          code: 'STORE_CAPABILITY',
          capability: 'atomic',
          purpose: 'lock',
          message: expect.stringContaining('atomic'),
        });
      }
    });

    it('rejects an otherwise atomic store that cannot provide locks', () => {
      const atomicStoreWithoutLocks = createAtomicStoreWithCapabilities(
        atomicCapabilitiesWithoutLocks,
      );

      try {
        requireAtomicStore(atomicStoreWithoutLocks, 'lock');
        throw new Error('Expected a lock requirement to reject an adapter without lock support');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreCapabilityError);
        expect(error).toMatchObject({
          code: 'STORE_CAPABILITY',
          capability: 'locks',
          purpose: 'lock',
          message: expect.stringContaining('locks'),
        });
      }
    });

    it('rejects an otherwise atomic store that cannot provide circuit breaker state', () => {
      const atomicStoreWithoutCircuitBreaker = createAtomicStoreWithCapabilities(
        atomicCapabilitiesWithoutCircuitBreaker,
      );

      try {
        requireAtomicStore(atomicStoreWithoutCircuitBreaker, 'circuitBreaker');
        throw new Error('Expected a circuit breaker requirement to reject an unsupported adapter');
      } catch (error) {
        expect(error).toBeInstanceOf(StoreCapabilityError);
        expect(error).toMatchObject({
          code: 'STORE_CAPABILITY',
          capability: 'circuitBreaker',
          purpose: 'circuitBreaker',
          message: expect.stringContaining('circuitBreaker'),
        });
      }
    });

    it('accepts an atomic store for a circuit breaker before execution', () => {
      expect(() => requireAtomicStore(createStore(), 'circuitBreaker')).not.toThrow();
    });
  });
}
