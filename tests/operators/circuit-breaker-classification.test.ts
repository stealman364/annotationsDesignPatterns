import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { InvocationInfo } from '../../src/core/invocation-info';
import type { AnyMethod } from '../../src/core/types';
import {
  circuitBreaker,
  CircuitBreakerOpenError,
  type CircuitBreakerOptions,
} from '../../src/operators/circuit-breaker';
import { timeout, TimeoutError } from '../../src/operators/timeout';
import { CircuitBreaker } from '../../src/patterns/utility/circuit-breaker';
import { definePolicy } from '../../src/policy/define-policy';
import { InvalidPolicyError } from '../../src/policy/validation';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

const counted = new Error('counted');
const ignored = new Error('ignored');

describe('circuit breaker failure classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('does not bind private normalized options as the predicate receiver', async () => {
    const predicateReceivers: unknown[] = [];
    const operation = circuitBreaker<object, readonly [], string>({
      failures: 1,
      resetMs: 100,
      isFailure(this: unknown) {
        predicateReceivers.push(this);
        return false;
      },
    }).apply(() => {
      throw counted;
    });
    await expect(operation.call({})).rejects.toBe(counted);
    expect(predicateReceivers).toEqual([undefined]);
  });

  it('does not apply an old classification after its callback reenters and closes a newer generation', async () => {
    vi.useFakeTimers();
    const operation: AnyMethod<object, readonly [error?: Error], string> = circuitBreaker<
      object,
      readonly [error?: Error],
      string
    >({
      failures: 1,
      resetMs: 100,
      isFailure(error) {
        if (error === ignored) {
          void Promise.resolve(operation.call({}, counted)).catch(() => undefined);
          vi.advanceTimersByTime(100);
          expect(operation.call({})).toBe('ok');
        }
        return true;
      },
    }).apply((error) => {
      if (error) throw error;
      return 'ok';
    });
    await expect(operation.call({}, ignored)).rejects.toBe(ignored);
    expect(operation.call({})).toBe('ok');
  });

  it('keeps invocation controls private and rejects mutable or asynchronous callback contracts in types', () => {
    const checkTypes = (): void => {
      const options: CircuitBreakerOptions<{ name: string }, [id: string]> = {
        failures: 1,
        resetMs: 100,
        isFailure(_error, info) {
          // @ts-expect-error Callback arguments are readonly even for mutable input tuples.
          info.args[0] = 'changed';
          // @ts-expect-error Callback metadata is readonly.
          info.metadata.tenant = 'changed';
          // @ts-expect-error The receiver binding is readonly.
          info.receiver = { name: 'changed' };
          // @ts-expect-error Execution signal is not part of decision information.
          void info.signal;
          return false;
        },
      };
      const invalid: CircuitBreakerOptions = {
        failures: 1,
        resetMs: 100,
        // @ts-expect-error Failure classifiers must return a boolean synchronously.
        isFailure: async () => false,
      };
      void options;
      void invalid;
    };
    expectTypeOf(checkTypes).toBeFunction();
  });

  it('ignores an error without incrementing or resetting preceding failures', async () => {
    const predicate = vi.fn((error: unknown) => error !== ignored);
    const operation = circuitBreaker<object, readonly [error?: Error], string>({
      failures: 2,
      resetMs: 100,
      isFailure: predicate,
    }).apply((error) => {
      if (error) throw error;
      return 'ok';
    });
    await expect(operation.call({}, counted)).rejects.toBe(counted);
    await expect(operation.call({}, ignored)).rejects.toBe(ignored);
    await expect(operation.call({}, counted)).rejects.toBe(counted);
    await expect(operation.call({})).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(predicate.mock.calls.map(([error]) => error)).toEqual([counted, ignored, counted]);
  });

  it.each(['ignored', 'throws', 'nonboolean'] as const)(
    'releases a HALF_OPEN probe after a decision that %s without closing or extending the reset',
    async (decision) => {
      vi.useFakeTimers();
      const predicateFailure = new Error('predicate failure');
      const events: string[] = [];
      const predicate = (error: unknown): boolean => {
        if (error !== ignored) return true;
        if (decision === 'throws') throw predicateFailure;
        return (decision === 'nonboolean' ? null : false) as boolean;
      };
      const operation = pipe(
        (error?: Error): string => {
          if (error) throw error;
          return 'ok';
        },
        circuitBreaker<object, readonly [error?: Error], string>({
          failures: 1,
          resetMs: 100,
          isFailure: predicate,
        }),
      );
      const context = {
        eventSink: {
          emit(event: { kind: string }): void {
            events.push(event.kind);
          },
        },
      };
      await expect(run({}, [counted], operation, context)).rejects.toBe(counted);
      vi.advanceTimersByTime(100);
      const probe = run({}, [ignored], operation, context);
      if (decision === 'throws') await expect(probe).rejects.toBe(predicateFailure);
      else if (decision === 'nonboolean') await expect(probe).rejects.toBeInstanceOf(TypeError);
      else await expect(probe).rejects.toBe(ignored);
      expect(events).toEqual(['circuit.open', 'circuit.half_open']);
      // An ignored/invalid decision leaves OPEN accounting intact, but a fresh
      // probe is available immediately because the prior reset already elapsed.
      expect(run({}, [], operation, context)).toBe('ok');
      expect(events).toEqual([
        'circuit.open',
        'circuit.half_open',
        'circuit.half_open',
        'circuit.closed',
      ]);
    },
  );

  it('rejects a throwing predicate without counting it or resetting preceding failures', async () => {
    const predicateFailure = new Error('predicate failure');
    const operation = circuitBreaker<object, readonly [error: Error], string>({
      failures: 2,
      resetMs: 100,
      isFailure(error) {
        if (error === ignored) throw predicateFailure;
        return true;
      },
    }).apply((error) => {
      throw error;
    });
    await expect(operation.call({}, counted)).rejects.toBe(counted);
    await expect(operation.call({}, ignored)).rejects.toBe(predicateFailure);
    await expect(operation.call({}, counted)).rejects.toBe(counted);
    await expect(operation.call({}, counted)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it('never passes caller cancellation to the predicate', async () => {
    const controller = new AbortController();
    const reason = new Error('caller');
    const predicate = vi.fn(() => true);
    const operation = pipe(
      () => new Promise<string>(() => {}),
      circuitBreaker<object, readonly [], string>({
        failures: 1,
        resetMs: 100,
        isFailure: predicate,
      }),
    );
    const result = run({}, [], operation, { signal: controller.signal });
    controller.abort(reason);
    await expect(result).rejects.toBe(reason);
    expect(predicate).not.toHaveBeenCalled();
  });

  it.each(['true', 'false', 'throws', 'nonboolean'] as const)(
    'prioritizes caller cancellation during a predicate that returns %s',
    async (decision) => {
      const controller = new AbortController();
      const reason = new Error('caller cancelled inside predicate');
      const operation = pipe(
        (fail: boolean): string => {
          if (fail) throw counted;
          return 'ok';
        },
        circuitBreaker<object, readonly [fail: boolean], string>({
          failures: 1,
          resetMs: 100,
          isFailure() {
            controller.abort(reason);
            if (decision === 'throws') throw new Error('predicate error');
            return (decision === 'true' ? true : decision === 'false' ? false : null) as boolean;
          },
        }),
      );
      await expect(run({}, [true], operation, { signal: controller.signal })).rejects.toBe(reason);
      expect(operation.call({}, false)).toBe('ok');
    },
  );

  it('passes an internal TimeoutError through the predicate as an ordinary failure', async () => {
    vi.useFakeTimers();
    const predicate = vi.fn(() => false);
    const operation = pipe(
      () => new Promise<string>(() => {}),
      circuitBreaker<object, readonly [], string>({
        failures: 1,
        resetMs: 100,
        isFailure: predicate,
      }),
      timeout<object, readonly [], string>(10),
    );
    const result = operation.call({});
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(predicate).toHaveBeenCalledWith(expect.any(TimeoutError), expect.any(Object));
  });

  it('skips the predicate for an obsolete probe and preserves the replacement owner', async () => {
    vi.useFakeTimers();
    const predicate = vi.fn(() => true);
    let rejectOld!: (reason: unknown) => void;
    let resolveNew!: (value: string) => void;
    const old = new Promise<string>((_complete, reject) => {
      rejectOld = reject;
    });
    const replacement = new Promise<string>((resolve) => {
      resolveNew = resolve;
    });
    const operation = circuitBreaker<object, readonly [mode: string], string>({
      failures: 1,
      resetMs: 100,
      isFailure: predicate,
    }).apply((mode) => {
      if (mode === 'fail') throw counted;
      return mode === 'old' ? old : replacement;
    });
    await expect(operation.call({}, 'fail')).rejects.toBe(counted);
    vi.advanceTimersByTime(100);
    const first = operation.call({}, 'old');
    vi.advanceTimersByTime(100);
    const second = operation.call({}, 'new');
    rejectOld(ignored);
    await expect(first).rejects.toBe(ignored);
    expect(predicate).toHaveBeenCalledTimes(1);
    await expect(operation.call({}, 'blocked')).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    resolveNew('ok');
    await expect(second).resolves.toBe('ok');
  });

  it('provides a shallow immutable, strongly typed invocation snapshot without signal or sink', async () => {
    type Receiver = { readonly name: string };
    type Args = [id: string, enabled: boolean];
    const receiver: Receiver = { name: 'service' };
    let received: InvocationInfo<Receiver, Args> | undefined;
    const operation = pipe(
      function (this: Receiver, _id: string, _enabled: boolean): string {
        void _id;
        void _enabled;
        throw counted;
      },
      circuitBreaker<Receiver, Args, string>({
        failures: 1,
        resetMs: 100,
        isFailure(_error, info) {
          expectTypeOf(info.receiver).toEqualTypeOf<Receiver>();
          expectTypeOf(info.args).toEqualTypeOf<readonly [id: string, enabled: boolean]>();
          received = info;
          return false;
        },
      }),
    );
    await expect(
      run(receiver, ['42', true], operation, {
        operationId: 'typed',
        key: 'key',
        metadata: { tenant: 'one' },
        signal: new AbortController().signal,
        eventSink: { emit(): void {} },
      }),
    ).rejects.toBe(counted);
    expect(received).toEqual({
      receiver,
      args: ['42', true],
      operationId: 'typed',
      key: 'key',
      metadata: { tenant: 'one' },
    });
    expect(Object.isFrozen(received)).toBe(true);
    expect(Object.isFrozen(received?.args)).toBe(true);
    expect(Object.isFrozen(received?.metadata)).toBe(true);
    expect(Object.isFrozen(receiver)).toBe(false);
    expect(received).not.toHaveProperty('signal');
    expect(received).not.toHaveProperty('eventSink');
  });

  it.each([null, false, 1, 'callback'])(
    'validates callback %s with existing constructor error classes',
    (isFailure) => {
      const options = { failures: 1, resetMs: 100, isFailure } as unknown as CircuitBreakerOptions;
      expect(() => circuitBreaker(options)).toThrow(TypeError);
      expect(() => CircuitBreaker(options)).toThrow(TypeError);
      expect(() => definePolicy({ circuitBreaker: options })).toThrow(InvalidPolicyError);
      expect(() => definePolicy({ circuitBreaker: options })).toThrow(
        expect.objectContaining({ path: 'circuitBreaker.isFailure' }),
      );
    },
  );

  it.each([
    { label: 'null', decide: () => null },
    { label: 'undefined', decide: () => undefined },
    { label: 'number', decide: () => 0 },
    { label: 'string', decide: () => 'false' },
    { label: 'promise', decide: () => Promise.resolve(false) },
    { label: 'rejected promise', decide: () => Promise.reject(ignored) },
  ])('rejects a non-boolean callback result without accounting it: $label', async ({ decide }) => {
    const operation = circuitBreaker<object, readonly [fail: boolean], string>({
      failures: 1,
      resetMs: 100,
      isFailure: decide as unknown as () => boolean,
    }).apply((fail) => {
      if (fail) throw counted;
      return 'ok';
    });
    await expect(operation.call({}, true)).rejects.toBeInstanceOf(TypeError);
    expect(operation.call({}, false)).toBe('ok');
  });

  it('snapshots the decorator predicate and forwards policy predicates with typed information', async () => {
    const predicate = vi.fn(() => false);
    const options = { failures: 1, resetMs: 100, isFailure: predicate };
    const decorator = CircuitBreaker(options);
    options.isFailure = vi.fn(() => true);
    class Service {
      @decorator
      async fail(): Promise<never> {
        throw ignored;
      }
    }
    const service = new Service();
    await expect(service.fail()).rejects.toBe(ignored);
    await expect(service.fail()).rejects.toBe(ignored);
    expect(predicate).toHaveBeenCalledTimes(2);
    const base = definePolicy<{ name: string }, readonly [id: string], string>({
      circuitBreaker: { failures: 1, resetMs: 100 },
    });
    expect(
      base.describe().layers.find(({ name }) => name === 'circuitBreaker')?.options,
    ).not.toHaveProperty('isFailure');
    const policy = base.extend({
      circuitBreaker: {
        isFailure(_error, info) {
          expectTypeOf(info.receiver).toEqualTypeOf<{ name: string }>();
          expectTypeOf(info.args).toEqualTypeOf<readonly [id: string]>();
          return false;
        },
      },
    });
    expect(
      policy.describe().layers.find(({ name }) => name === 'circuitBreaker')?.options,
    ).toMatchObject({ isFailure: '[function]' });
    const operation = pipe((_id: string): string => {
      void _id;
      throw ignored;
    }, policy.operator());
    await expect(operation.call({ name: 'receiver' }, '42')).rejects.toBe(ignored);
    await expect(operation.call({ name: 'receiver' }, '42')).rejects.toBe(ignored);
  });
});
