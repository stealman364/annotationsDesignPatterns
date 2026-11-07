import { describe, expect, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import { TimeoutError } from '../../src/operators/timeout';
import {
  observeOperation as publicObserveOperation,
  type ObserveOperationOptions,
} from '../../src/experimental/observe-operation';
import { isContextualOperator } from '../../src/core/contextual-operator';

function observeOperation<
  This = unknown,
  Args extends readonly unknown[] = readonly unknown[],
  Result = unknown,
>(options: ObserveOperationOptions<This, Args>) {
  const operator = publicObserveOperation<This, Args, Result>(options);
  if (!isContextualOperator(operator)) throw new Error('Expected internal contextual support');
  return operator;
}

describe('observeOperation', () => {
  it.each(['primitive', 'non-callable', 'getter-throws'])(
    'prioritizes an abort while obtaining %s',
    async (kind) => {
      const controller = new AbortController();
      const complete = vi.fn();
      const next = () => {
        if (kind === 'primitive') {
          controller.abort('left');
          return 1;
        }
        return Object.defineProperty({}, 'then', {
          get() {
            controller.abort('left');
            if (kind === 'getter-throws') throw new Error('accessor');
            return 1;
          },
        });
      };
      const method = observeOperation({ onComplete: complete }).applyWithContext(next);
      await expect(
        method(createOperationContext({}, [], { signal: controller.signal })),
      ).rejects.toBe('left');
      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete.mock.calls[0]![0].outcome).toBe('cancelled');
    },
  );
  it('preserves a business promise when its constructor prevents observation', async () => {
    const result = Promise.resolve('ok');
    Object.defineProperty(result, 'constructor', {
      configurable: true,
      get() {
        throw new Error('hostile species');
      },
    });
    const complete = vi.fn();
    expect(observeOperation({ onComplete: complete }).apply(() => result)()).toBe(result);
    expect(complete).not.toHaveBeenCalled();
    Reflect.deleteProperty(result, 'constructor');
    await expect(result).resolves.toBe('ok');
  });
  it.each([null, undefined, 0, () => 'function', { then: 1 }])(
    'preserves synchronous %s under a live signal',
    (value) => {
      const complete = vi.fn();
      const context = createOperationContext({}, [], { signal: new AbortController().signal });
      expect(
        observeOperation({ onComplete: complete }).applyWithContext(() => value)(context),
      ).toBe(value);
      expect(complete).toHaveBeenCalledTimes(1);
    },
  );

  it('captures readonly direct invocation data including key and empty metadata', () => {
    const complete = vi.fn();
    const direct = observeOperation<object, readonly [number], number>({
      onComplete: complete,
      includeInvocation: true,
    }).apply((value) => value);
    expect(direct.call({}, 3)).toBe(3);
    expect(complete.mock.calls[0]![0].invocation.args).toEqual([3]);
    const context = createOperationContext({}, [4] as const, { key: 'logical' });
    observeOperation({ onComplete: complete, includeInvocation: true }).applyWithContext(() => 4)(
      context,
    );
    expect(complete.mock.calls[1]![0].invocation.key).toBe('logical');
  });

  it('reports cancellation winning during synchronous work without replacing its reason', () => {
    const controller = new AbortController();
    const reason = new Error('caller');
    const complete = vi.fn();
    const wrapped = observeOperation({ onComplete: complete }).applyWithContext(() => {
      controller.abort(reason);
      throw new Error('later business error');
    });
    expect(() => wrapped(createOperationContext({}, [], { signal: controller.signal }))).toThrow(
      reason,
    );
    expect(complete.mock.calls[0]![0].outcome).toBe('cancelled');
  });

  it('reports signalled then accessor and invocation failures exactly once', async () => {
    for (const kind of ['getter', 'call']) {
      const failure = new Error(kind);
      const value = Object.defineProperty({}, 'then', {
        get() {
          if (kind === 'getter') throw failure;
          return () => {
            throw failure;
          };
        },
      });
      const complete = vi.fn();
      const context = createOperationContext({}, [], { signal: new AbortController().signal });
      await expect(
        observeOperation({ onComplete: complete }).applyWithContext(() => value)(context),
      ).rejects.toBe(failure);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(complete.mock.calls[0]![0].outcome).toBe('error');
    }
  });

  it('retains a cancellation that happens while a then getter is evaluated', async () => {
    const controller = new AbortController();
    const complete = vi.fn();
    const value = Object.defineProperty({}, 'then', {
      get() {
        controller.abort('left');
        return (resolve: (value: string) => void) => resolve('late');
      },
    });
    const context = createOperationContext({}, [], { signal: controller.signal });
    await expect(
      observeOperation({ onComplete: complete }).applyWithContext(() => value)(context),
    ).rejects.toBe('left');
    expect(complete.mock.calls[0]![0].outcome).toBe('cancelled');
  });

  it('isolates an instrumentation then getter that throws', () => {
    const observerResult = Object.defineProperty({}, 'then', {
      get() {
        throw new Error('instrumentation');
      },
    });
    expect(observeOperation({ onComplete: () => observerResult }).apply(() => 7)()).toBe(7);
  });

  it('requires a valid completion callback', () => {
    expect(() => publicObserveOperation({ onComplete: undefined as never })).toThrow(TypeError);
  });
  it('keeps a plain object synchronous and unchanged', () => {
    const value = { answer: 42 };
    const complete = vi.fn();
    expect(observeOperation({ onComplete: complete }).apply(() => value)()).toBe(value);
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('preserves synchronous results and reports one success', () => {
    const observations: unknown[] = [];
    const operator = observeOperation({
      onComplete: (observation) => observations.push(observation),
    });
    const wrapped = operator.applyWithContext(() => 'ok');

    expect(wrapped(undefined)).toBe('ok');
    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({ outcome: 'success' });
    expect((observations[0] as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
  });

  it('preserves synchronous throws and reports one error', () => {
    const error = new Error('operation failed');
    const onComplete = vi.fn();
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => {
      throw error;
    });

    expect(() => wrapped(undefined)).toThrow(error);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'error' });
  });

  it('returns a native promise unchanged and observes its settled outcome once', async () => {
    const onComplete = vi.fn();
    const promise = Promise.resolve('ok');
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => promise);

    const result = wrapped(undefined);
    expect(result).toBe(promise);
    await expect(result).resolves.toBe('ok');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'success' });
  });

  it('assimilates a thenable only once and returns an observed promise', async () => {
    const onComplete = vi.fn();
    let thenGets = 0;
    let thenCalls = 0;
    const thenable = Object.defineProperty({}, 'then', {
      get() {
        thenGets += 1;
        return (resolve: (value: string) => void) => {
          thenCalls += 1;
          resolve('ok');
        };
      },
    });
    const wrapped = observeOperation({ onComplete }).applyWithContext(
      () => thenable as PromiseLike<string>,
    );

    await expect(wrapped(undefined)).resolves.toBe('ok');
    expect(thenGets).toBe(1);
    expect(thenCalls).toBe(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'success' });
  });

  it('reads and invokes a signaled thenable exactly once', async () => {
    const onComplete = vi.fn();
    let thenGets = 0;
    let thenCalls = 0;
    const thenable = Object.defineProperty({}, 'then', {
      get() {
        thenGets += 1;
        return (resolve: (value: string) => void) => {
          thenCalls += 1;
          resolve('ok');
        };
      },
    });
    const context = createOperationContext({}, [], { signal: new AbortController().signal });
    const wrapped = observeOperation({ onComplete }).applyWithContext(
      () => thenable as PromiseLike<string>,
    );

    await expect(wrapped(context)).resolves.toBe('ok');
    expect(thenGets).toBe(1);
    expect(thenCalls).toBe(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'success' });
  });

  it('observes a then getter failure as a business error', async () => {
    const onComplete = vi.fn();
    const error = new Error('broken then getter');
    let thenGets = 0;
    const thenable = Object.defineProperty({}, 'then', {
      get() {
        thenGets += 1;
        throw error;
      },
    });
    const wrapped = observeOperation({ onComplete }).applyWithContext(
      () => thenable as PromiseLike<string>,
    );

    await expect(wrapped(undefined)).rejects.toBe(error);
    expect(thenGets).toBe(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'error' });
  });

  it('observes a thenable rejection without replacing the rejection reason', async () => {
    const onComplete = vi.fn();
    const error = new Error('thenable failed');
    let thenCalls = 0;
    const thenable: PromiseLike<never> = {
      then(_resolve, reject) {
        thenCalls += 1;
        reject?.(error);
        return undefined as never;
      },
    };
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => thenable);

    await expect(wrapped(undefined)).rejects.toBe(error);
    expect(thenCalls).toBe(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'error' });
  });

  it('treats a preaborted contextual entry as a caller cancellation without invoking the method', async () => {
    const controller = new AbortController();
    const reason = new Error('caller stopped');
    controller.abort(reason);
    const onComplete = vi.fn();
    const next = vi.fn(() => 'should not run');
    const wrapped = observeOperation({ onComplete }).applyWithContext(next);
    const context = createOperationContext({}, [], { signal: controller.signal });

    await expect(wrapped(context)).rejects.toBe(reason);
    expect(next).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'cancelled' });
  });

  it('observes cancellation of this consumer while shared work continues', async () => {
    const controller = new AbortController();
    const reason = new Error('one caller stopped');
    let finish!: (value: string) => void;
    const underlying = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const onComplete = vi.fn();
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => underlying);
    const context = createOperationContext({}, [], { signal: controller.signal });
    const result = wrapped(context);

    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'cancelled' });
    finish('late result');
  });

  it('classifies an AbortError without caller signal provenance as an error', async () => {
    const onComplete = vi.fn();
    const error = new DOMException('backend aborted', 'AbortError');
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => Promise.reject(error));

    await expect(wrapped(undefined)).rejects.toBe(error);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'error' });
  });

  it('classifies timeout errors as errors even when the invocation has a signal', async () => {
    const onComplete = vi.fn();
    const error = new TimeoutError(1);
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => Promise.reject(error));
    const context = createOperationContext({}, [], { signal: new AbortController().signal });

    await expect(wrapped(context)).rejects.toBe(error);
    expect(onComplete.mock.calls[0]?.[0]).toMatchObject({ outcome: 'error' });
  });

  it('includes immutable invocation data only when requested', async () => {
    const onComplete = vi.fn();
    const args = ['secret argument'] as const;
    const context = createOperationContext({ id: 'receiver' }, args, {
      operationId: 'operation-1',
      metadata: { private: true },
    });
    const wrapped = observeOperation({ onComplete, includeInvocation: true }).applyWithContext(
      () => 'ok',
    );

    expect(wrapped(context)).toBe('ok');
    const observation = onComplete.mock.calls[0]?.[0];
    expect(observation).toMatchObject({
      outcome: 'success',
      invocation: { operationId: 'operation-1' },
    });
    const invocation = (
      observation as { invocation: { args: readonly string[]; metadata: object } }
    ).invocation;
    expect(Object.isFrozen(observation)).toBe(true);
    expect(Object.isFrozen(invocation)).toBe(true);
    expect(Object.isFrozen(invocation.args)).toBe(true);
    expect(Object.isFrozen(invocation.metadata)).toBe(true);
  });

  it('isolates synchronous and accidental asynchronous observer failures', async () => {
    const onComplete = vi.fn(() => {
      throw new Error('observer failed');
    });
    const wrapped = observeOperation({ onComplete }).applyWithContext(() => 'business result');

    expect(wrapped(undefined)).toBe('business result');
    expect(onComplete).toHaveBeenCalledTimes(1);

    const asyncWrapped = observeOperation({
      onComplete: () => Promise.reject(new Error('async observer failed')),
    }).applyWithContext(() => 'still business result');
    expect(asyncWrapped(undefined)).toBe('still business result');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
