import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import type { AnyMethod } from '../../src/core/types';
import type { RuntimeOperationContext } from '../../src/core/context';
import { cachedForWithHandle } from '../../src/operators/cached-for';
import { CacheHandleStore } from '../../src/operators/cache-handle';
import { memoizeWithHandle } from '../../src/operators/memoize';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });

  return {
    promise,
    resolve(value: Value): void {
      resolve?.(value);
    },
    reject(reason: unknown): void {
      reject?.(reason);
    },
  };
}

function createCapturingSink(events: PolicyEvent[]): EventSink {
  return {
    emit(event): void {
      events.push(event);
    },
  };
}

describe('memoize cache handle', () => {
  it('does not clear a replacement created by a reentrant invalidation observer', () => {
    let calls = 0;
    const receiver: Receiver = { prefix: 'api' };
    const cache = memoizeWithHandle<Receiver, Args, string>({ key: (id: string) => id });
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const operation = pipe(method, cache.operator);
    const repopulate = (): void => {
      operation.call(receiver, 'second');
    };
    const sink: EventSink = {
      emit(event): void {
        if (event.kind === 'cache.invalidated' && event.key === 'first') {
          repopulate();
        }
      },
    };

    expect(
      run(receiver, ['first'] as const, operation, {
        operationId: 'clear-reentrant',
        eventSink: sink,
      }),
    ).toBe('api:first:1');

    cache.handle.clear();

    expect(operation.call(receiver, 'second')).toBe('api:second:2');
    expect(calls).toBe(2);
  });

  it('invalidates one resolved key and forces a new execution without changing memoize()', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const cache = memoizeWithHandle<Receiver, Args, string>({
      key: (id: string) => id.toLowerCase(),
    });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    expect(operation.call(receiver, 'ACCOUNT')).toBe('api:ACCOUNT:1');
    expect(operation.call(receiver, 'account')).toBe('api:ACCOUNT:1');

    cache.handle.invalidate('account');

    expect(operation.call(receiver, 'account')).toBe('api:account:2');
    expect(calls).toBe(2);
  });

  it('clears every cached key without requiring a new operator instance', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, number> = function (): number {
      calls += 1;
      return calls;
    };
    const cache = memoizeWithHandle<Receiver, Args, number>({ key: (id: string) => id });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    expect(operation.call(receiver, 'account')).toBe(1);
    expect(operation.call(receiver, 'profile')).toBe(2);
    expect(operation.call(receiver, 'account')).toBe(1);

    cache.handle.clear();

    expect(operation.call(receiver, 'account')).toBe(3);
    expect(operation.call(receiver, 'profile')).toBe(4);
    expect(calls).toBe(4);
  });

  it('lets an invalidated pending generation finish for its current consumer without repopulating it', async () => {
    const first = deferred<string>();
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve('fresh');
    };
    const cache = memoizeWithHandle<Receiver, Args, string>({ key: (id: string) => id });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    const pending = operation.call(receiver, 'account');
    cache.handle.invalidate('account');
    const replacement = operation.call(receiver, 'account');

    first.resolve('stale-but-delivered');
    await expect(pending).resolves.toBe('stale-but-delivered');
    await expect(replacement).resolves.toBe('fresh');
    expect(operation.call(receiver, 'account')).toBe(replacement);
    expect(calls).toBe(2);
  });

  it('does not let a rejected invalidated generation evict its replacement', async () => {
    const first = deferred<string>();
    const failure = new Error('stale upstream failure');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? first.promise : Promise.resolve('replacement');
    };
    const cache = memoizeWithHandle<Receiver, Args, string>({ key: (id: string) => id });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    const stale = operation.call(receiver, 'account');
    cache.handle.invalidate('account');
    const replacement = operation.call(receiver, 'account');

    first.reject(failure);

    await expect(stale).rejects.toBe(failure);
    await expect(replacement).resolves.toBe('replacement');
    expect(operation.call(receiver, 'account')).toBe(replacement);
    expect(calls).toBe(2);
  });

  it('emits cache.invalidated through the context that owns the invalidated entry', () => {
    const events: PolicyEvent[] = [];
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls += 1;
      return `${this.prefix}:${id}:${calls}`;
    };
    const cache = memoizeWithHandle<Receiver, Args, string>({ key: (id: string) => id });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };
    const sink = createCapturingSink(events);

    expect(
      run(receiver, ['account'] as const, operation, {
        operationId: 'cache-handle-first',
        eventSink: sink,
      }),
    ).toBe('api:account:1');
    expect(
      run(receiver, ['account'] as const, operation, {
        operationId: 'cache-handle-hit',
        eventSink: sink,
      }),
    ).toBe('api:account:1');

    cache.handle.invalidate('account');

    expect(
      run(receiver, ['account'] as const, operation, {
        operationId: 'cache-handle-replacement',
        eventSink: sink,
      }),
    ).toBe('api:account:2');
    expect(events.map((event) => event.kind)).toEqual([
      'cache.miss',
      'cache.hit',
      'cache.invalidated',
      'cache.miss',
    ]);
    expect(events[2]).toMatchObject({
      kind: 'cache.invalidated',
      operator: 'memoize',
      key: 'account',
    });
  });
});

describe('cache handle context ownership', () => {
  it('stores only the observation fields needed for later invalidation', () => {
    const receiver = { prefix: 'sensitive receiver' };
    const controller = new AbortController();
    const metadata = Object.freeze({ requestId: 'context-projection' });
    const sink: EventSink = {
      emit(event): void {
        void event;
      },
    };
    const context: RuntimeOperationContext<Receiver, Args> = Object.freeze({
      receiver,
      args: Object.freeze(['account']) as unknown as Args,
      operationId: 'context-projection',
      metadata,
      eventSink: sink,
      signal: controller.signal,
    });
    const store = new CacheHandleStore<string>('memoize');

    const entry = store.set('account', 'cached', context);
    const storedContext = entry.context as unknown as Record<string, unknown>;

    expect(entry.context).not.toBe(context);
    expect(storedContext).toMatchObject({
      operationId: 'context-projection',
      metadata,
      eventSink: sink,
    });
    expect(storedContext).not.toHaveProperty('receiver');
    expect(storedContext).not.toHaveProperty('args');
    expect(storedContext).not.toHaveProperty('signal');
  });

  it('emits one invalidation per entry on clear and ignores keys already removed', () => {
    const events: PolicyEvent[] = [];
    const context: RuntimeOperationContext<Receiver, Args> = Object.freeze({
      receiver: { prefix: 'api' },
      args: Object.freeze(['account']) as unknown as Args,
      operationId: 'clear-entries',
      metadata: Object.freeze({ requestId: 'clear-entries' }),
      eventSink: createCapturingSink(events),
    });
    const store = new CacheHandleStore<string>('memoize');

    store.set('account', 'cached-account', context);
    store.set('profile', 'cached-profile', context);

    store.handle.clear();
    store.handle.invalidate('account');
    store.handle.clear();

    expect(store.get('account')).toBeUndefined();
    expect(store.get('profile')).toBeUndefined();
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.kind)).toEqual(['cache.invalidated', 'cache.invalidated']);
    expect(events).toEqual([
      expect.objectContaining({ kind: 'cache.invalidated', key: 'account' }),
      expect.objectContaining({ kind: 'cache.invalidated', key: 'profile' }),
    ]);
  });
});

describe('cachedFor cache handle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retains cachedFor TTL semantics and leaves no entry timer after expiration', () => {
    let calls = 0;
    const method: AnyMethod<Receiver, Args, number> = function (): number {
      calls += 1;
      return calls;
    };
    const cache = cachedForWithHandle<Receiver, Args, number>(1_000, {
      key: (id: string) => id,
    });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    expect(operation.call(receiver, 'account')).toBe(1);
    vi.advanceTimersByTime(999);
    expect(operation.call(receiver, 'account')).toBe(1);
    vi.advanceTimersByTime(1);
    expect(operation.call(receiver, 'account')).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('evicts a rejected cachedFor value and leaves no timer after invalidation', async () => {
    const failure = new Error('unavailable');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return calls === 1 ? Promise.reject(failure) : Promise.resolve('recovered');
    };
    const cache = cachedForWithHandle<Receiver, Args, string>(1_000, {
      key: (id: string) => id,
    });
    const operation = pipe(method, cache.operator);
    const receiver = { prefix: 'api' };

    await expect(operation.call(receiver, 'account')).rejects.toBe(failure);
    await expect(operation.call(receiver, 'account')).resolves.toBe('recovered');

    cache.handle.invalidate('account');

    expect(vi.getTimerCount()).toBe(0);
    await expect(operation.call(receiver, 'account')).resolves.toBe('recovered');
    expect(calls).toBe(3);
  });
});
