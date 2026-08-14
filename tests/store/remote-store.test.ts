import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreCapabilities } from '../../src/core/store';
import {
  RemoteAsyncStore,
  RemoteStoreError,
  type RemoteStoreTransport,
} from '../../src/store/remote-store';

const remoteCapabilities = Object.freeze({
  atomic: false,
  consistency: 'eventual',
  ttl: true,
  isolation: 'shared',
  network: 'required',
  locks: false,
  circuitBreaker: false,
} as const satisfies StoreCapabilities);

const atomicTransportCapabilities = Object.freeze({
  ...remoteCapabilities,
  atomic: true,
  circuitBreaker: true,
  locks: true,
} as const satisfies StoreCapabilities);

type TransportCall = readonly [operation: string, ...args: ReadonlyArray<unknown>];

interface TrackingTransport extends RemoteStoreTransport<string, number> {
  readonly calls: TransportCall[];
}

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
      resolvePromise?.();
    },
  };
}

function createTransport(
  overrides: Partial<RemoteStoreTransport<string, number>> = {},
): TrackingTransport {
  const values = new Map<string, number>();
  const calls: TransportCall[] = [];

  return {
    capabilities: remoteCapabilities,
    calls,
    async get(key: string): Promise<number | undefined> {
      calls.push(['get', key]);
      return values.get(key);
    },
    async has(key: string): Promise<boolean> {
      calls.push(['has', key]);
      return values.has(key);
    },
    async set(key: string, value: number, options): Promise<void> {
      calls.push(['set', key, value, options]);
      values.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      calls.push(['delete', key]);
      return values.delete(key);
    },
    async clear(): Promise<void> {
      calls.push(['clear']);
      values.clear();
    },
    ...overrides,
  };
}

describe('RemoteAsyncStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('delegates the async store contract and exposes the transport capabilities', async () => {
    const transport = createTransport();
    const store = new RemoteAsyncStore(transport);

    await store.set('count', 1, { ttlMs: 50 });
    await expect(store.get('count')).resolves.toBe(1);
    await expect(store.has('count')).resolves.toBe(true);
    await expect(store.delete('count')).resolves.toBe(true);
    await store.clear();

    expect(store.capabilities).toEqual(remoteCapabilities);
    expect(transport.calls).toEqual([
      ['set', 'count', 1, { ttlMs: 50 }],
      ['get', 'count'],
      ['has', 'count'],
      ['delete', 'count'],
      ['clear'],
    ]);
  });

  it('does not advertise transport atomicity that this CRUD-only wrapper cannot expose', () => {
    const transport = createTransport({ capabilities: atomicTransportCapabilities });
    const store = new RemoteAsyncStore(transport);

    expect(store.capabilities).toMatchObject({
      atomic: false,
      circuitBreaker: false,
      locks: false,
    });
    expect('update' in store).toBe(false);
  });

  it('rejects invalid transport deadlines before making a remote call', () => {
    const transport = createTransport();

    expect(() => new RemoteAsyncStore(transport, { timeoutMs: -1 })).toThrow(RangeError);
    expect(() => new RemoteAsyncStore(transport, { timeoutMs: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    );
    expect(transport.calls).toEqual([]);
  });

  it('normalizes a transport network failure without losing its cause', async () => {
    const networkFailure = new Error('connection refused');
    const transport = createTransport({
      get(): Promise<number | undefined> {
        return Promise.reject(networkFailure);
      },
    });
    const store = new RemoteAsyncStore(transport);

    try {
      await store.get('count');
      throw new Error('Expected the remote transport failure to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteStoreError);
      expect(error).toMatchObject({
        code: 'REMOTE_STORE_NETWORK',
        operation: 'get',
        cause: networkFailure,
      });
    }
  });

  it('reports a configured transport deadline with a distinct timeout code', async () => {
    vi.useFakeTimers();
    const transport = createTransport({
      get(): Promise<number | undefined> {
        return new Promise<number | undefined>(() => undefined);
      },
    });
    const store = new RemoteAsyncStore(transport, { timeoutMs: 25 });

    const request = store.get('slow');
    const timeout = expect(request).rejects.toMatchObject({
      code: 'REMOTE_STORE_TIMEOUT',
      operation: 'get',
    });

    await vi.advanceTimersByTimeAsync(25);

    await timeout;
  });

  it('allows a remote read/write race instead of inferring atomic CAS from get and set', async () => {
    const bothReadsStarted = createGate();
    let value = 0;
    let reads = 0;
    const transport: RemoteStoreTransport<string, number> = {
      capabilities: remoteCapabilities,
      async get(): Promise<number | undefined> {
        const snapshot = value;
        reads += 1;
        if (reads === 2) {
          bothReadsStarted.release();
        }
        await bothReadsStarted.promise;
        return snapshot;
      },
      async has(): Promise<boolean> {
        return true;
      },
      async set(_key: string, next: number): Promise<void> {
        value = next;
      },
      async delete(): Promise<boolean> {
        return false;
      },
      async clear(): Promise<void> {
        value = 0;
      },
    };
    const store = new RemoteAsyncStore(transport);

    const increment = async (): Promise<void> => {
      const current = await store.get('counter');
      await store.set('counter', (current ?? 0) + 1);
    };

    await expect(Promise.all([increment(), increment()])).resolves.toEqual([undefined, undefined]);

    expect(value).toBe(1);
    expect(store.capabilities.atomic).toBe(false);
    expect('update' in store).toBe(false);
  });

  it('returns a slow successful transport response before its deadline and clears the timer', async () => {
    vi.useFakeTimers();
    const transport = createTransport({
      get(): Promise<number | undefined> {
        return new Promise<number | undefined>((resolve) => {
          setTimeout(() => resolve(7), 10);
        });
      },
    });
    const store = new RemoteAsyncStore(transport, { timeoutMs: 25 });
    let result: number | undefined;
    const request = store.get('fast').then((value) => {
      result = value;
      return value;
    });

    await vi.advanceTimersByTimeAsync(9);
    expect(result).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not turn a caller operation failure into a remote store failure', async () => {
    const transport = createTransport();
    const store = new RemoteAsyncStore(transport);
    const callerFailure = new Error('operation validation failed');

    await store.set('count', 1);

    const callerOperation = async (): Promise<number> => {
      const value = await store.get('count');
      if (value === undefined) {
        throw new Error('Expected the remote value to be present');
      }
      throw callerFailure;
    };

    try {
      await callerOperation();
      throw new Error('Expected the caller operation to fail');
    } catch (error) {
      expect(error).toBe(callerFailure);
      expect(error).not.toBeInstanceOf(RemoteStoreError);
    }
  });
});
