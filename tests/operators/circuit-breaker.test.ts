import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import type { AnyMethod } from '../../src/core/types';

interface Receiver {
  readonly name: string;
}

type Args = readonly [id: string];

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    resolve(value: Value): void {
      resolve?.(value);
    },
  };
}

describe('circuitBreaker operator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens after the configured consecutive failures and rejects without invoking the target', async () => {
    const failure = new Error('upstream failure');
    let executions = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      executions += 1;
      throw failure;
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({
      failures: 2,
      resetMs: 100,
    }).apply(method);

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');

    expect(executions).toBe(2);
  });

  it('allows a successful half-open probe after reset and closes the circuit again', async () => {
    const failure = new Error('upstream failure');
    let shouldFail = true;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      if (shouldFail) {
        throw failure;
      }
      return 'recovered';
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');

    await vi.advanceTimersByTimeAsync(100);
    shouldFail = false;

    expect(wrapped.call({ name: 'api' }, 'account')).toBe('recovered');
    expect(wrapped.call({ name: 'api' }, 'account')).toBe('recovered');
  });

  it('permits only one concurrent half-open probe', async () => {
    const failure = new Error('upstream failure');
    const probe = deferred<string>();
    let executions = 0;
    let useProbe = false;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      executions += 1;
      if (!useProbe) {
        return Promise.reject(failure);
      }
      return probe.promise;
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(100);
    useProbe = true;

    const firstProbe = wrapped.call({ name: 'api' }, 'account');
    const secondProbe = wrapped.call({ name: 'api' }, 'account');

    await expect(secondProbe).rejects.toThrow('Circuito abierto');
    expect(executions).toBe(2);

    probe.resolve('recovered');
    await expect(firstProbe).resolves.toBe('recovered');
  });

  it('reopens from a failed half-open probe and starts a new reset window', async () => {
    const initialFailure = new Error('initial failure');
    const probeFailure = new Error('probe failure');
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      return Promise.reject(calls === 1 ? initialFailure : probeFailure);
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(initialFailure);
    await vi.advanceTimersByTimeAsync(100);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(probeFailure);
    await vi.advanceTimersByTimeAsync(99);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');

    expect(calls).toBe(2);
  });

  it('keeps state isolated between operator pipelines', async () => {
    const failure = new Error('upstream failure');
    let executions = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      executions += 1;
      throw failure;
    };
    const firstPipeline = circuitBreaker<Receiver, Args, string>({
      failures: 1,
      resetMs: 100,
    }).apply(method);
    const secondPipeline = circuitBreaker<Receiver, Args, string>({
      failures: 1,
      resetMs: 100,
    }).apply(method);

    await expect(firstPipeline.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(firstPipeline.call({ name: 'api' }, 'account')).rejects.toThrow(
      'Circuito abierto',
    );
    await expect(secondPipeline.call({ name: 'api' }, 'account')).rejects.toBe(failure);

    expect(executions).toBe(2);
  });

  it('keeps separate apply calls on the same operator isolated', async () => {
    const failure = new Error('upstream failure');
    let executions = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      executions += 1;
      throw failure;
    };
    const operator = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 });
    const firstPipeline = operator.apply(method);
    const secondPipeline = operator.apply(method);

    await expect(firstPipeline.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(firstPipeline.call({ name: 'api' }, 'account')).rejects.toThrow(
      'Circuito abierto',
    );
    await expect(secondPipeline.call({ name: 'api' }, 'account')).rejects.toBe(failure);

    expect(executions).toBe(2);
  });

  it('does not let an earlier closed call close a circuit opened by another call', async () => {
    const lateSuccess = deferred<string>();
    const failure = new Error('upstream failure');
    let call = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      call += 1;
      return call === 1 ? lateSuccess.promise : Promise.reject(failure);
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );

    const firstCall = wrapped.call({ name: 'api' }, 'account');
    const secondCall = wrapped.call({ name: 'api' }, 'account');

    await expect(secondCall).rejects.toBe(failure);
    lateSuccess.resolve('late success');
    await expect(firstCall).resolves.toBe('late success');
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');

    expect(call).toBe(2);
  });

  it('does not move the reset window when an earlier closed call fails late', async () => {
    const lateFailure = new Error('late failure');
    const openingFailure = new Error('opening failure');
    let rejectLate!: (reason: Error) => void;
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        return new Promise((_resolve, reject) => {
          rejectLate = reject;
        });
      }
      return Promise.reject(openingFailure);
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );
    const lateCall = wrapped.call({ name: 'api' }, 'account');
    const lateAssertion = expect(lateCall).rejects.toBe(lateFailure);

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(openingFailure);
    rejectLate(lateFailure);
    await lateAssertion;
    await vi.advanceTimersByTimeAsync(99);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');

    expect(calls).toBe(2);
  });

  it('counts a throwing thenable getter as a failure', async () => {
    const failure = new Error('then getter failure');
    const result = Object.defineProperty({}, 'then', {
      get(): never {
        throw failure;
      },
    });
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      return result as string;
    };
    const wrapped = circuitBreaker<Receiver, Args, string>({ failures: 1, resetMs: 100 }).apply(
      method,
    );

    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toBe(failure);
    await expect(wrapped.call({ name: 'api' }, 'account')).rejects.toThrow('Circuito abierto');
  });

  it.each([
    { failures: 0, resetMs: 100 },
    { failures: Number.NaN, resetMs: 100 },
    { failures: Number.POSITIVE_INFINITY, resetMs: 100 },
    { failures: 1, resetMs: 0 },
    { failures: 1, resetMs: Number.NaN },
    { failures: 1, resetMs: Number.POSITIVE_INFINITY },
  ])('rejects invalid finite options: %o', (options) => {
    expect(() => circuitBreaker(options)).toThrow(RangeError);
  });
});
