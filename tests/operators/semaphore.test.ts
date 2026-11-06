import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import type { PolicyEvent } from '../../src/core/events';
import { PolicyError } from '../../src/core/errors';
import { invokeWithContext } from '../../src/core/invocation';
import {
  semaphore,
  SemaphoreQueueFullError,
  type SemaphoreKeyContext,
} from '../../src/operators/semaphore';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function recordingContext(operationId: string, events: PolicyEvent[], signal?: AbortSignal) {
  return {
    operationId,
    signal,
    eventSink: {
      emit(event: PolicyEvent): void {
        events.push(event);
      },
    },
  };
}

describe('functional semaphore', () => {
  it('prioritizes cancellation triggered by a throwing key resolver', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel during partition resolution');
    const body = vi.fn(() => 'unreachable');
    const operation = pipe(
      body,
      semaphore<object, readonly [], string>({
        permits: 1,
        key() {
          controller.abort(reason);
          throw new Error('later key error');
        },
      }),
    );
    await expect(
      invokeWithContext(
        {},
        [],
        operation,
        createOperationContext({}, [], { signal: controller.signal }),
      ),
    ).rejects.toBe(reason);
    expect(body).not.toHaveBeenCalled();
  });

  it('infers key resolver arguments when used directly in pipe', async () => {
    const operation = pipe(
      (id: string): string => id,
      semaphore({
        permits: 2,
        key: (context) => {
          expectTypeOf(context.args[0]).toEqualTypeOf<string>();
          return context.args[0];
        },
      }),
    );
    await expect(operation.call({}, 'tenant')).resolves.toBe('tenant');
  });
  it('always returns a promise while starting admitted work synchronously', async () => {
    const starts: string[] = [];
    const operation = pipe(
      function (this: { prefix: string }, id: string) {
        starts.push(id);
        return this.prefix + id;
      },
      semaphore<{ prefix: string }, readonly [string], string>({ permits: 1 }),
    );
    const call = operation.call({ prefix: 'api:' }, 'one');
    expect(call).toBeInstanceOf(Promise);
    expect(starts).toEqual(['one']);
    await expect(call).resolves.toBe('api:one');
  });

  it.each(['resolve', 'reject', 'throw'] as const)(
    'releases after %s and preserves FIFO across receivers',
    async (outcome) => {
      const active = deferred();
      const failure = new Error('business');
      const starts: string[] = [];
      const operation = pipe(
        (id: string): string | Promise<string> => {
          starts.push(id);
          if (id === 'first') {
            if (outcome === 'throw') throw failure;
            return active.promise;
          }
          return id;
        },
        semaphore<object, readonly [string], string>({ permits: 1 }),
      );
      const first = operation.call({}, 'first');
      const assertion =
        outcome === 'resolve'
          ? expect(first).resolves.toBe('first')
          : expect(first).rejects.toBe(failure);
      const second = operation.call({}, 'second');
      const third = operation.call({}, 'third');
      if (outcome === 'resolve') active.resolve('first');
      if (outcome === 'reject') active.reject(failure);
      await assertion;
      await expect(second).resolves.toBe('second');
      await expect(third).resolves.toBe('third');
      expect(starts).toEqual(['first', 'second', 'third']);
    },
  );

  it('rejects a pre-aborted caller at the operator boundary without running work', async () => {
    const controller = new AbortController();
    const reason = { cancelled: true };
    controller.abort(reason);
    const body = vi.fn(() => 'unexpected');
    const operation = pipe(body, semaphore<object, readonly [], string>({ permits: 1 }));
    await expect(
      invokeWithContext(
        {},
        [],
        operation,
        createOperationContext({}, [], { signal: controller.signal }),
      ),
    ).rejects.toBe(reason);
    expect(body).not.toHaveBeenCalled();
  });

  it('withdraws an aborted waiter, frees maxQueue, and detaches its listener', async () => {
    const active = deferred();
    const starts: string[] = [];
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      semaphore<object, readonly [string], string>({ permits: 1, maxQueue: 1 }),
    );
    const first = operation.call({}, 'first');
    const cancelled = run({}, ['cancelled'], operation, { signal: controller.signal });
    const reason = Symbol('caller');
    const assertion = expect(cancelled).rejects.toBe(reason);
    controller.abort(reason);
    await assertion;
    expect(remove).toHaveBeenCalled();
    const next = operation.call({}, 'next');
    active.resolve('first');
    await first;
    await expect(next).resolves.toBe('next');
    expect(starts).toEqual(['first', 'next']);
  });

  it('holds active ownership after caller cancellation until noncooperative work settles', async () => {
    const active = deferred();
    const controller = new AbortController();
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      semaphore<object, readonly [string], string>({ permits: 1 }),
    );
    const first = run({}, ['first'], operation, { signal: controller.signal });
    const next = operation.call({}, 'next');
    const reason = new Error('cancel first');
    controller.abort(reason);
    await expect(first).rejects.toBe(reason);
    expect(starts).toEqual(['first']);
    active.resolve('late result');
    await expect(next).resolves.toBe('next');
    expect(starts).toEqual(['first', 'next']);
  });

  it('checks cancellation again between grant and execution', async () => {
    const active = deferred();
    const controller = new AbortController();
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      semaphore<object, readonly [string], string>({ permits: 1 }),
    );
    const first = operation.call({}, 'first');
    const cancelled = run({}, ['cancelled'], operation, { signal: controller.signal });
    const next = operation.call({}, 'next');
    const reason = new Error('after grant');
    const assertion = expect(cancelled).rejects.toBe(reason);
    active.resolve('first');
    // The active completion transfers its permit, then this continuation
    // aborts before the waiting caller resumes.
    void active.promise.then(() => controller.abort(reason));
    await first;
    await assertion;
    await expect(next).resolves.toBe('next');
    expect(starts).toEqual(['first', 'next']);
  });

  it('emits existing events in caller order and remains safe when acquired observers cancel', async () => {
    const events: PolicyEvent[] = [];
    const active = deferred();
    const controller = new AbortController();
    const reason = new Error('observer cancellation');
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      semaphore<object, readonly [string], string>({ permits: 1 }),
    );
    const first = run({}, ['first'], operation, recordingContext('first', events));
    const cancelled = run({}, ['cancelled'], operation, {
      operationId: 'cancelled',
      signal: controller.signal,
      eventSink: {
        emit(event) {
          events.push(event);
          if (event.kind === 'semaphore.acquired') controller.abort(reason);
        },
      },
    });
    const assertion = expect(cancelled).rejects.toBe(reason);
    const next = run({}, ['next'], operation, recordingContext('next', events));
    active.resolve('first');
    await first;
    await assertion;
    await expect(next).resolves.toBe('next');
    expect(starts).toEqual(['first', 'next']);
    expect(events.map(({ kind, operationId }) => [kind, operationId])).toEqual([
      ['semaphore.acquired', 'first'],
      ['semaphore.queued', 'cancelled'],
      ['semaphore.queued', 'next'],
      ['semaphore.released', 'first'],
      ['semaphore.acquired', 'cancelled'],
      ['semaphore.released', 'cancelled'],
      ['semaphore.acquired', 'next'],
      ['semaphore.released', 'next'],
    ]);
    expect(events.every(({ operator }) => operator === 'semaphore')).toBe(true);
  });

  it('handles cancellation from a queued observer without losing capacity', async () => {
    const active = deferred();
    const controller = new AbortController();
    const reason = new Error('queued observer');
    const operation = pipe(
      (id: string) => (id === 'first' ? active.promise : id),
      semaphore<object, readonly [string], string>({ permits: 1, maxQueue: 1 }),
    );
    const first = operation.call({}, 'first');
    const cancelled = run({}, ['cancelled'], operation, {
      signal: controller.signal,
      eventSink: {
        emit(event) {
          if (event.kind === 'semaphore.queued') controller.abort(reason);
        },
      },
    });
    await expect(cancelled).rejects.toBe(reason);
    const next = operation.call({}, 'next');
    active.resolve('first');
    await first;
    await expect(next).resolves.toBe('next');
  });

  it('uses independent key partitions and gives an explicit context key precedence', async () => {
    const active = deferred();
    const contexts: SemaphoreKeyContext<object, readonly [string]>[] = [];
    const operation = pipe(
      (id: string) => (id === 'first' ? active.promise : id),
      semaphore<object, readonly [string], string>({
        permits: 1,
        maxQueue: 0,
        key: (context) => {
          contexts.push(context);
          return context.args[0];
        },
      }),
    );
    const first = operation.call({}, 'first');
    await expect(operation.call({}, 'other')).resolves.toBe('other');
    await expect(run({}, ['ignored'], operation, { key: 'first' })).rejects.toBeInstanceOf(
      SemaphoreQueueFullError,
    );
    expect(contexts).toHaveLength(2);
    expect(Object.isFrozen(contexts[0])).toBe(true);
    expect(Object.isFrozen(contexts[0]?.args)).toBe(true);
    expectTypeOf<SemaphoreKeyContext<object, readonly [string]>['args']>().toEqualTypeOf<
      readonly [string]
    >();
    active.resolve('first');
    await first;
  });

  it.each([0, 1])(
    'rejects overflow at maxQueue %s with a PolicyError and no new event',
    async (maxQueue) => {
      const active = deferred();
      const events: PolicyEvent[] = [];
      const operation = pipe(
        () => active.promise,
        semaphore<object, readonly [], string>({ permits: 1, maxQueue }),
      );
      const first = operation.call({});
      const waiting = maxQueue === 1 ? operation.call({}) : undefined;
      const full = run({}, [], operation, recordingContext('overflow', events));
      await expect(full).rejects.toBeInstanceOf(SemaphoreQueueFullError);
      await expect(full).rejects.toBeInstanceOf(PolicyError);
      await expect(full).rejects.toMatchObject({ code: 'POLICY_ERROR', key: undefined });
      expect(events).toEqual([]);
      active.resolve('done');
      await first;
      if (waiting !== undefined) await waiting;
    },
  );

  it('rejects key resolver errors through its promise channel', async () => {
    const failure = new Error('resolver');
    const operation = pipe(
      () => 'unused',
      semaphore<object, readonly [], string>({
        permits: 1,
        key: () => {
          throw failure;
        },
      }),
    );
    let result: unknown;
    expect(() => {
      result = operation.call({});
    }).not.toThrow();
    await expect(result).rejects.toBe(failure);
  });

  it('removes all signal listeners on successful queued acquisition and settlement', async () => {
    const active = deferred();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let removedBeforeWork = false;
    const operation = pipe(
      (id: string) => {
        if (id === 'first') return active.promise;
        removedBeforeWork = remove.mock.calls.length > 0;
        return id;
      },
      semaphore<object, readonly [string], string>({ permits: 1 }),
    );
    const first = operation.call({}, 'first');
    const next = invokeWithContext(
      {},
      ['next'],
      operation,
      createOperationContext({}, ['next'] as const, { signal: controller.signal }),
    );
    active.resolve('first');
    await first;
    await expect(next).resolves.toBe('next');
    expect(removedBeforeWork).toBe(true);
    for (const [event, listener] of add.mock.calls) {
      expect(remove).toHaveBeenCalledWith(event, listener);
    }
    expect(remove.mock.calls).toHaveLength(add.mock.calls.length);
  });

  it('preserves error metadata and rejects an invalid key resolver early', () => {
    const cause = new Error('cause');
    const failure = new SemaphoreQueueFullError('tenant', 'full', {
      cause,
      metadata: { limit: 1 },
    });
    expect(failure).toMatchObject({
      key: 'tenant',
      message: 'full',
      cause,
      metadata: { limit: 1 },
      code: 'POLICY_ERROR',
    });
    expect(() => semaphore({ permits: 1, key: 1 as unknown as () => string })).toThrow(TypeError);
  });

  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid permits %s',
    (permits) => {
      expect(() => semaphore({ permits })).toThrow(RangeError);
    },
  );
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid maxQueue %s',
    (maxQueue) => {
      expect(() => semaphore({ permits: 1, maxQueue })).toThrow(RangeError);
    },
  );

  it('keeps FIFO and peak concurrency through 100 calls with deterministic cancellation and failure', async () => {
    const controllers = Array.from({ length: 100 }, () => new AbortController());
    const starts: number[] = [];
    let active = 0;
    let peak = 0;
    const operation = pipe(
      async (id: number) => {
        active++;
        peak = Math.max(peak, active);
        starts.push(id);
        try {
          await Promise.resolve();
          if (id % 11 === 0) throw new Error('business');
          return String(id);
        } finally {
          active--;
        }
      },
      semaphore<object, readonly [number], string>({ permits: 3, maxQueue: 80 }),
    );
    const calls = controllers.map((controller, id) =>
      Promise.resolve(run({}, [id], operation, { signal: controller.signal })).catch(
        () => 'rejected',
      ),
    );
    controllers.forEach((controller, id) => {
      if (id >= 3 && id % 4 === 0) controller.abort(id);
    });
    await Promise.all(calls);
    expect(peak).toBeLessThanOrEqual(3);
    expect(active).toBe(0);
    expect(starts.every((id) => !controllers[id]?.signal.aborted)).toBe(true);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    await expect(operation.call({}, 101)).resolves.toBe('101');
  });
});
