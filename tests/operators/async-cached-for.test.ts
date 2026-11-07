import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  asyncCachedFor,
  isAsyncCacheError,
  type AsyncCacheProvider,
  type AsyncCachedForOptions,
} from '../../src/experimental/async-cached-for';
import { executionMethod, run } from '../../src/public/run';
import { pipe } from '../../src/public/pipe';
import { AsyncMemoryStore } from '../../src/store/async-memory-store';

class MemoryProvider implements AsyncCacheProvider {
  readonly capabilities = { ttl: true } as const;
  readonly entries = new Map<string, unknown>();
  reads = 0;
  writes = 0;
  ttls: number[] = [];
  readError: unknown;
  writeError: unknown;
  getImplementation?: (key: string) => Promise<unknown | undefined>;
  setImplementation?: (key: string, value: unknown) => Promise<void>;

  async get(key: string): Promise<unknown | undefined> {
    this.reads += 1;
    if (this.getImplementation) return this.getImplementation(key);
    if (this.readError !== undefined) throw this.readError;
    return this.entries.get(key);
  }

  async set(
    key: string,
    value: unknown,
    entryOptions?: { readonly ttlMs?: number },
  ): Promise<void> {
    this.writes += 1;
    if (this.writeError !== undefined) throw this.writeError;
    this.ttls.push(entryOptions?.ttlMs ?? 0);
    if (this.setImplementation) return this.setImplementation(key, value);
    this.entries.set(key, value);
  }
}

function options<Args extends readonly unknown[], Result>(
  store: AsyncCacheProvider,
  overrides: Partial<AsyncCachedForOptions<Args, Result>> = {},
): AsyncCachedForOptions<Args, Result> {
  return {
    store,
    namespace: 'accounts',
    schemaVersion: 'v1',
    key: (...args: Args) => (args.length === 0 ? 'empty' : String(args[0])),
    codec: {
      encode: (value: Result) => ({ value }),
      decode: (payload: unknown) => (payload as { value: Result }).value,
    },
    storeFailure: 'reject' as const,
    ioTimeoutMs: 100,
    ...overrides,
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => vi.useRealTimers());

describe('asyncCachedFor', () => {
  it.each(['version', 'descriptor', 'payload'] as const)(
    'classifies a throwing envelope %s accessor as schema failure',
    async (trap) => {
      const failure = new Error(`envelope ${trap}`);
      const envelope = new Proxy(
        { version: 1, payload: { value: 'cached' } },
        {
          get(target, key, receiver) {
            if (
              (trap === 'version' && key === 'version') ||
              (trap === 'payload' && key === 'payload')
            )
              throw failure;
            return Reflect.get(target, key, receiver);
          },
          getOwnPropertyDescriptor(target, key) {
            if (trap === 'descriptor' && key === 'payload') throw failure;
            return Reflect.getOwnPropertyDescriptor(target, key);
          },
        },
      );
      for (const storeFailure of ['bypass', 'reject'] as const) {
        const store = new MemoryProvider();
        store.entries.set('["accounts","v1","a"]', envelope);
        const business = vi.fn(() => 'business');
        const diagnostic = vi.fn();
        const cached = asyncCachedFor(
          500,
          options<readonly [string], string>(store, { storeFailure, onDiagnostic: diagnostic }),
        ).apply(business);
        await expect(cached.call({}, 'a')).rejects.toMatchObject({
          name: 'AsyncCacheError',
          phase: 'schema',
          cause: failure,
        });
        expect(business).not.toHaveBeenCalled();
        expect(diagnostic).not.toHaveBeenCalled();
        expect(store.writes).toBe(0);
      }
    },
  );

  it('always returns a Promise and caches encoded values on a miss', async () => {
    const store = new MemoryProvider();
    let calls = 0;
    const cached = pipe(
      function (id: string) {
        calls += 1;
        return `${id}:${calls}`;
      },
      asyncCachedFor(500, options<readonly [id: string], string>(store)),
    );

    const first = cached.call({}, 'a');
    expect(first).toBeInstanceOf(Promise);
    await expect(first).resolves.toBe('a:1');
    await expect(cached.call({}, 'a')).resolves.toBe('a:1');
    expect(calls).toBe(1);
    expect(store.writes).toBe(1);
    expect(store.ttls).toEqual([500]);
    expect(store.entries.get('["accounts","v1","a"]')).toEqual({
      version: 1,
      payload: { value: 'a:1' },
    });
  });

  it('preserves method arguments on direct apply without contextual composition', async () => {
    const store = new MemoryProvider();
    const operator = asyncCachedFor<object, readonly [id: string], string>(
      500,
      options<readonly [id: string], string>(store),
    );
    const cached = operator.apply(function (id: string) {
      return `result:${id}`;
    });

    await expect(cached.call({}, 'direct')).resolves.toBe('result:direct');
  });

  it('accepts the existing TTL-capable AsyncMemoryStore contract', async () => {
    const store = new AsyncMemoryStore<string, unknown>();
    const cached = pipe(
      (id: string) => `value:${id}`,
      asyncCachedFor(500, options<readonly [id: string], string>(store)),
    );

    await expect(cached.call({}, 'a')).resolves.toBe('value:a');
    await expect(cached.call({}, 'a')).resolves.toBe('value:a');
  });

  it('uses an own payload property so cached undefined differs from a miss', async () => {
    const store = new MemoryProvider();
    let calls = 0;
    const cached = pipe(
      function () {
        calls += 1;
        return undefined;
      },
      asyncCachedFor(500, options<readonly [], undefined>(store)),
    );

    await expect(cached.call({})).resolves.toBeUndefined();
    await expect(cached.call({})).resolves.toBeUndefined();
    expect(calls).toBe(1);
    expect(store.entries.get('["accounts","v1","empty"]')).toEqual({
      version: 1,
      payload: { value: undefined },
    });
  });

  it('separates namespaces and schema versions in the provider key', async () => {
    const store = new MemoryProvider();
    let calls = 0;
    const base = (schemaVersion: string) =>
      pipe(
        function (id: string) {
          calls += 1;
          return `${schemaVersion}:${id}`;
        },
        asyncCachedFor(
          500,
          options<readonly [id: string], string>(store, { namespace: 'shared', schemaVersion }),
        ),
      );

    await expect(base('v1').call({}, 'a')).resolves.toBe('v1:a');
    await expect(base('v2').call({}, 'a')).resolves.toBe('v2:a');
    await expect(
      pipe(
        function (id: string) {
          calls += 1;
          return `other:${id}`;
        },
        asyncCachedFor(
          500,
          options<readonly [id: string], string>(store, {
            namespace: 'other',
            schemaVersion: 'v1',
          }),
        ),
      ).call({}, 'a'),
    ).resolves.toBe('other:a');
    expect(calls).toBe(3);
    expect(store.entries.size).toBe(3);
  });

  it('requires valid TTL, positive finite I/O deadline, and explicit provider TTL capability', () => {
    expect(() => asyncCachedFor(0, options<readonly [], string>(new MemoryProvider()))).toThrow(
      RangeError,
    );
    expect(() =>
      asyncCachedFor(
        100,
        options<readonly [], string>(new MemoryProvider(), { ioTimeoutMs: Infinity }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      asyncCachedFor(
        100,
        options<readonly [], string>({
          capabilities: { ttl: false },
          get: async () => undefined,
          set: async () => undefined,
        }),
      ),
    ).toThrow(TypeError);
  });

  it('validates namespace, schema version, failure policy, codec, and provider methods', () => {
    const store = new MemoryProvider();
    const valid = options<readonly [], string>(store);

    expect(() => asyncCachedFor(100, { ...valid, namespace: '' })).toThrow(TypeError);
    expect(() => asyncCachedFor(100, { ...valid, schemaVersion: '' })).toThrow(TypeError);
    expect(() => asyncCachedFor(100, { ...valid, key: undefined } as never)).toThrow(TypeError);
    expect(() => asyncCachedFor(100, { ...valid, storeFailure: 'ignore' } as never)).toThrow(
      TypeError,
    );
    expect(() => asyncCachedFor(100, { ...valid, codec: {} } as never)).toThrow(TypeError);
    expect(() =>
      asyncCachedFor(100, {
        ...valid,
        store: { capabilities: { ttl: true }, get: async () => undefined },
      } as never),
    ).toThrow(TypeError);
  });

  it('cancels a pending read and never starts business work after it resolves late', async () => {
    const store = new MemoryProvider();
    const read = deferred<unknown | undefined>();
    store.getImplementation = () => read.promise;
    let calls = 0;
    const method = pipe(
      executionMethod(() => {
        calls += 1;
        return 'uncached';
      }),
      asyncCachedFor(500, options<readonly [], string>(store)),
    );
    const controller = new AbortController();
    const reason = new Error('cancelled during read');
    const waiting = run({}, [], method, { signal: controller.signal });
    controller.abort(reason);

    await expect(waiting).rejects.toBe(reason);
    read.resolve(undefined);
    await Promise.resolve();
    expect(calls).toBe(0);
    expect(store.writes).toBe(0);
  });

  it('detects cancellation caused synchronously by the provider read', async () => {
    const controller = new AbortController();
    const reason = new Error('provider cancelled caller');
    let calls = 0;
    const store: AsyncCacheProvider = {
      capabilities: { ttl: true },
      get() {
        controller.abort(reason);
        return undefined;
      },
      set: async () => undefined,
    };
    const method = pipe(
      executionMethod(() => {
        calls += 1;
        return 'business';
      }),
      asyncCachedFor(500, options<readonly [], string>(store)),
    );

    await expect(run({}, [], method, { signal: controller.signal })).rejects.toBe(reason);
    expect(calls).toBe(0);
  });

  it('checks cancellation after business work and does not write after cancellation', async () => {
    const store = new MemoryProvider();
    const controller = new AbortController();
    const reason = new Error('cancelled in business');
    const method = pipe(
      executionMethod(() => {
        controller.abort(reason);
        return 'business result';
      }),
      asyncCachedFor(500, options<readonly [], string>(store)),
    );

    await expect(run({}, [], method, { signal: controller.signal })).rejects.toBe(reason);
    expect(store.writes).toBe(0);
  });

  it.each(['read', 'write'] as const)(
    'bypasses a %s transport failure in bypass mode',
    async (phase) => {
      const store = new MemoryProvider();
      if (phase === 'read') store.readError = new Error('read offline');
      else store.writeError = new Error('write offline');
      const method = pipe(
        () => 'business result',
        asyncCachedFor(500, options<readonly [], string>(store, { storeFailure: 'bypass' })),
      );

      await expect(method.call({})).resolves.toBe('business result');
      if (phase === 'read') expect(store.writes).toBe(0);
    },
  );

  it('rejects write transport failure after business work in reject mode', async () => {
    const store = new MemoryProvider();
    store.writeError = new Error('write offline');
    let calls = 0;
    const method = pipe(
      () => {
        calls += 1;
        return 'business result';
      },
      asyncCachedFor(500, options<readonly [], string>(store)),
    );

    await expect(method.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'write',
    );
    expect(calls).toBe(1);
  });

  it('rejects read transport failure in reject mode without running business work', async () => {
    const store = new MemoryProvider();
    store.readError = new Error('read offline');
    let calls = 0;
    const method = pipe(
      () => {
        calls += 1;
        return 'business result';
      },
      asyncCachedFor(500, options<readonly [], string>(store)),
    );

    await expect(method.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'read',
    );
    expect(calls).toBe(0);
  });

  it('wraps synchronous provider throws as transport failures', async () => {
    const store: AsyncCacheProvider = {
      capabilities: { ttl: true },
      get() {
        throw new Error('sync read failure');
      },
      set() {
        throw new Error('sync write failure');
      },
    };
    const method = pipe(
      () => 'business result',
      asyncCachedFor(500, options<readonly [], string>(store, { storeFailure: 'reject' })),
    );

    await expect(method.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'read',
    );
  });

  it('wraps key callback throws and invalid return values before business execution', async () => {
    const store = new MemoryProvider();
    const failure = new Error('key callback failed');
    let calls = 0;
    const throwingKey = pipe(
      () => {
        calls += 1;
        return 'business';
      },
      asyncCachedFor(
        500,
        options<readonly [], string>(store, {
          key: () => {
            throw failure;
          },
        }),
      ),
    );
    await expect(throwingKey.call({})).rejects.toSatisfy(
      (error: unknown) =>
        isAsyncCacheError(error) && error.phase === 'key' && error.cause === failure,
    );

    const invalidKey = pipe(
      () => {
        calls += 1;
        return 'business';
      },
      asyncCachedFor(500, options<readonly [], string>(store, { key: () => 123 as never })),
    );
    await expect(invalidKey.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'key',
    );
    expect(calls).toBe(0);
  });

  it.each([{ version: 2, payload: 'old' }, { version: 1 }, []])(
    'rejects invalid envelopes and codec errors even in bypass mode',
    async (invalidEnvelope) => {
      const store = new MemoryProvider();
      store.entries.set('["accounts","v1","a"]', invalidEnvelope);
      const cached = pipe(
        (id: string) => `business:${id}`,
        asyncCachedFor(
          500,
          options<readonly [id: string], string>(store, { storeFailure: 'bypass' }),
        ),
      );

      await expect(cached.call({}, 'a')).rejects.toSatisfy(
        (error: unknown) => isAsyncCacheError(error) && error.phase === 'schema',
      );

      const codecFailure = new Error('codec failed');
      const brokenStore = new MemoryProvider();
      brokenStore.entries.set('["accounts","v1","a"]', { version: 1, payload: 'payload' });
      const broken = pipe(
        (id: string) => `business:${id}`,
        asyncCachedFor(
          500,
          options<readonly [id: string], string>(brokenStore, {
            storeFailure: 'bypass',
            codec: {
              encode: (value: string) => value,
              decode: () => {
                throw codecFailure;
              },
            },
          }),
        ),
      );
      await expect(broken.call({}, 'a')).rejects.toSatisfy(
        (error: unknown) =>
          isAsyncCacheError(error) && error.phase === 'decode' && error.cause === codecFailure,
      );

      const encodeFailure = new Error('encode failed');
      const encoding = pipe(
        () => 'business',
        asyncCachedFor(
          500,
          options<readonly [], string>(new MemoryProvider(), {
            storeFailure: 'bypass',
            codec: {
              encode: () => {
                throw encodeFailure;
              },
              decode: () => 'unused',
            },
          }),
        ),
      );
      await expect(encoding.call({})).rejects.toSatisfy(
        (error: unknown) =>
          isAsyncCacheError(error) && error.phase === 'encode' && error.cause === encodeFailure,
      );
    },
  );

  it('times out a read, bypasses transport failure, and observes a late rejection', async () => {
    vi.useFakeTimers();
    const store = new MemoryProvider();
    const read = deferred<unknown | undefined>();
    store.getImplementation = () => read.promise;
    const method = pipe(
      () => 'business result',
      asyncCachedFor(
        500,
        options<readonly [], string>(store, { ioTimeoutMs: 10, storeFailure: 'bypass' }),
      ),
    );
    const result = method.call({});
    const assertion = expect(result).resolves.toBe('business result');
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    read.reject(new Error('late read rejection'));
    await Promise.resolve();
    await Promise.resolve();
  });

  it('times out a write in bypass mode and observes the late rejection', async () => {
    vi.useFakeTimers();
    const store = new MemoryProvider();
    const write = deferred<void>();
    store.setImplementation = () => write.promise;
    const method = pipe(
      () => 'business result',
      asyncCachedFor(
        500,
        options<readonly [], string>(store, { ioTimeoutMs: 10, storeFailure: 'bypass' }),
      ),
    );
    const result = method.call({});
    const assertion = expect(result).resolves.toBe('business result');
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    write.reject(new Error('late write rejection'));
    await Promise.resolve();
    await Promise.resolve();
  });

  it('checks cancellation after encoding and before starting a write', async () => {
    const store = new MemoryProvider();
    const controller = new AbortController();
    const reason = new Error('cancelled during encoding');
    const method = pipe(
      executionMethod(() => 'business result'),
      asyncCachedFor(
        500,
        options<readonly [], string>(store, {
          codec: {
            encode(value) {
              controller.abort(reason);
              return value;
            },
            decode(payload) {
              return payload as string;
            },
          },
        }),
      ),
    );

    await expect(run({}, [], method, { signal: controller.signal })).rejects.toBe(reason);
    expect(store.writes).toBe(0);
  });

  it('isolates a throwing or rejected diagnostic callback', async () => {
    const store = new MemoryProvider();
    store.readError = new Error('offline');
    const method = pipe(
      () => 'business result',
      asyncCachedFor(
        500,
        options<readonly [], string>(store, {
          storeFailure: 'bypass',
          onDiagnostic: () => Promise.reject(new Error('diagnostic failure')),
        }),
      ),
    );

    await expect(method.call({})).resolves.toBe('business result');
  });

  it('rejects asynchronous codec methods and observes their late failures', async () => {
    const store = new MemoryProvider();
    const encoder = pipe(
      () => 'business result',
      asyncCachedFor(
        500,
        options<readonly [], string>(store, {
          codec: {
            encode: () => Promise.reject(new Error('async encode')) as never,
            decode: (payload) => payload as string,
          },
        }),
      ),
    );
    await expect(encoder.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'encode',
    );

    const decodeStore = new MemoryProvider();
    decodeStore.entries.set('["accounts","v1","empty"]', { version: 1, payload: 'cached' });
    const decoder = pipe(
      () => 'unused',
      asyncCachedFor(
        500,
        options<readonly [], string>(decodeStore, {
          codec: {
            encode: (value) => value,
            decode: () => Promise.reject(new Error('async decode')) as never,
          },
        }),
      ),
    );
    await expect(decoder.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'decode',
    );
    await Promise.resolve();
  });

  it('snapshots options while preserving the codec method receiver', async () => {
    const store = new MemoryProvider();
    store.writeError = new Error('write offline');
    const codec = {
      calls: 0,
      encode(this: { calls: number }, value: string) {
        this.calls += 1;
        return value;
      },
      decode(value: unknown) {
        return value as string;
      },
    };
    const configuration = options<readonly [], string>(store, { codec });
    const operator = asyncCachedFor(500, configuration);
    (configuration as { storeFailure: 'bypass' | 'reject' }).storeFailure = 'bypass';
    const method = pipe(() => 'business result', operator);

    await expect(method.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'write',
    );
    expect(codec.calls).toBe(1);
  });

  it('returns false from its branded guard when a proxy throws during inspection', () => {
    const hostile = new Proxy(
      {},
      {
        get: () => {
          throw new Error('inspection failed');
        },
      },
    );
    expect(isAsyncCacheError(hostile)).toBe(false);
    expect(isAsyncCacheError(undefined)).toBe(false);
  });

  it('observes a hostile thenable returned by a codec', async () => {
    const hostileThenable = Object.defineProperty({}, 'then', {
      get() {
        throw new Error('then inspection failed');
      },
    });
    const method = pipe(
      () => 'business result',
      asyncCachedFor(
        500,
        options<readonly [], string>(new MemoryProvider(), {
          codec: {
            encode: () => hostileThenable as never,
            decode: (payload) => payload as string,
          },
        }),
      ),
    );

    await expect(method.call({})).rejects.toSatisfy(
      (error: unknown) => isAsyncCacheError(error) && error.phase === 'encode',
    );
  });
});
