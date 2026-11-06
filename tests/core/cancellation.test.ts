import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  callerSignal,
  invokeWithSignal,
  isCallerCancellation,
  raceWithSignal,
  sharedContext,
  withExecutionSignal,
} from '../../src/core/cancellation';
import { createOperationContext } from '../../src/core/context';
import { timeout } from '../../src/operators/timeout';
import { run } from '../../src/public/run';

describe('cancellation primitive boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([null, undefined, 0, 'value', {}, () => 'value'])(
    'preserves synchronous value identity with an active signal: %s',
    (value) => {
      const controller = new AbortController();
      expect(run({}, [], () => value, { signal: controller.signal })).toBe(value);
    },
  );

  it('preserves synchronous return and throw without a signal or with a live signal', () => {
    const value = {};
    const failure = new Error('synchronous business failure');
    const controller = new AbortController();
    for (const signal of [undefined, controller.signal]) {
      expect(invokeWithSignal(() => value, signal)).toBe(value);
      expect(() =>
        invokeWithSignal(() => {
          throw failure;
        }, signal),
      ).toThrow(failure);
    }
  });

  it('rejects a throwing then getter under a caller signal and removes the listener', async () => {
    const failure = new Error('then getter failure');
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const hostile = Object.defineProperty({}, 'then', {
      get(): never {
        throw failure;
      },
    }) as PromiseLike<string>;
    const result = run({}, [], () => hostile, { signal: controller.signal });
    await expect(result).rejects.toBe(failure);
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it.each(['resolve', 'reject'] as const)(
    'assimilates a callable thenable that %ss and removes the listener',
    async (outcome) => {
      const controller = new AbortController();
      const removed = vi.spyOn(controller.signal, 'removeEventListener');
      let resolve!: (value: string) => void;
      let reject!: (reason: unknown) => void;
      const pending = new Promise<string>((complete, fail) => {
        resolve = complete;
        reject = fail;
      });
      const thenable = Object.assign(() => undefined, { then: pending.then.bind(pending) });
      const result = run({}, [], () => thenable, { signal: controller.signal });
      const failure = new Error('thenable rejection');
      if (outcome === 'resolve') {
        resolve('result');
        await expect(result).resolves.toBe('result');
      } else {
        reject(failure);
        await expect(result).rejects.toBe(failure);
      }
      expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    },
  );

  it('handles an abort synchronously dispatched while registering the listener', async () => {
    const controller = new AbortController();
    const reason = new Error('abort during listener registration');
    const add = controller.signal.addEventListener.bind(controller.signal);
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation(
      (type, listener, options) => {
        add(type, listener, options);
        controller.abort(reason);
      },
    );
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((complete) => {
      resolve = complete;
    });
    const result = run({}, [], () => pending, { signal: controller.signal });
    await expect(result).rejects.toBe(reason);
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    resolve('late result');
    await pending;
  });

  it('observes a late rejection even when the signal aborted before promise assimilation', async () => {
    const controller = new AbortController();
    const reason = new Error('already aborted');
    controller.abort(reason);
    let reject!: (reason: unknown) => void;
    const pending = new Promise<string>((_complete, fail) => {
      reject = fail;
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const result = raceWithSignal(pending, controller.signal);
      await expect(result).rejects.toBe(reason);
      reject(new Error('late underlying rejection'));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('distinguishes root cancellation from derived timeout and unrelated AbortError', () => {
    const root = new AbortController();
    const execution = new AbortController();
    const context = createOperationContext({}, [], { signal: root.signal });
    const derived = withExecutionSignal(context, execution.signal);
    const timeoutReason = new Error('internal timeout');
    execution.abort(timeoutReason);
    expect(callerSignal(derived)).toBe(root.signal);
    expect(isCallerCancellation(timeoutReason, derived)).toBe(false);
    expect(isCallerCancellation(new DOMException('unrelated', 'AbortError'), context)).toBe(false);
    root.abort(NaN);
    expect(isCallerCancellation(NaN, derived)).toBe(true);
    expect(isCallerCancellation(timeoutReason, derived)).toBe(false);
    expect(callerSignal(sharedContext(derived))).toBeUndefined();
    expect(isCallerCancellation(NaN, sharedContext(derived))).toBe(false);
    expect(sharedContext(undefined)).toBeUndefined();
    expect(callerSignal(undefined)).toBeUndefined();
  });

  it('cleans a direct timeout when the underlying method throws synchronously', async () => {
    vi.useFakeTimers();
    const failure = new Error('synchronous business failure');
    const operation = timeout<object, readonly [], string>(100).apply(() => {
      throw failure;
    });
    await expect(operation.call({})).rejects.toBe(failure);
    expect(vi.getTimerCount()).toBe(0);
  });
});
