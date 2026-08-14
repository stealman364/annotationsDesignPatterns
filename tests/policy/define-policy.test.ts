import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import type { AnyMethod } from '../../src/core/types';
import { definePolicy } from '../../src/policy/define-policy';
import type { PolicyRetryContext } from '../../src/policy/types';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

afterEach(() => {
  vi.useRealTimers();
});

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

function recordingSink(events: PolicyEvent[]): EventSink {
  return {
    emit(event): void {
      events.push(event);
    },
  };
}

describe('definePolicy', () => {
  it('exhausts retry before the outer fallback recovers the operation', async () => {
    const failure = new Error('upstream unavailable');
    const events: PolicyEvent[] = [];
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      calls += 1;
      throw failure;
    };
    const policy = definePolicy<Receiver, Args, string>({
      fallback: { value: 'recovered' },
      retry: { attempts: 2, idempotent: true },
    });
    const protectedMethod = pipe(method, policy.operator());

    await expect(
      run({ prefix: 'api' }, ['account'] as const, protectedMethod, {
        operationId: 'policy-operation',
        eventSink: recordingSink(events),
      }),
    ).resolves.toBe('recovered');

    expect(calls).toBe(2);
    expect(events.map((event) => event.kind)).toEqual([
      'retry.attempt',
      'retry.attempt',
      'retry.exhausted',
      'fallback.used',
    ]);
  });

  it('creates a reusable operator without changing its captured configuration', async () => {
    const policy = definePolicy<Receiver, Args, string>({
      retry: { attempts: 2, idempotent: true },
    });
    const operator = policy.operator();
    let firstCalls = 0;
    let secondCalls = 0;
    const firstMethod: AnyMethod<Receiver, Args, string> = function (): string {
      firstCalls += 1;
      if (firstCalls === 1) {
        throw new Error('first temporary failure');
      }
      return 'first';
    };
    const secondMethod: AnyMethod<Receiver, Args, string> = function (): string {
      secondCalls += 1;
      if (secondCalls === 1) {
        throw new Error('second temporary failure');
      }
      return 'second';
    };
    const first = pipe(firstMethod, operator);
    const second = pipe(secondMethod, operator);
    const receiver: Receiver = { prefix: 'api' };

    await expect(first.call(receiver, 'one')).resolves.toBe('first');
    await expect(second.call(receiver, 'two')).resolves.toBe('second');
    expect(firstCalls).toBe(2);
    expect(secondCalls).toBe(2);
  });

  it('passes the invocation context to shouldRetry without exposing core types', async () => {
    const failure = new Error('transient');
    const receivedContexts: PolicyRetryContext<Receiver, Args>[] = [];
    const policy = definePolicy<Receiver, Args, string>({
      retry: {
        attempts: 3,
        idempotent: true,
        shouldRetry(error, attempt, context): boolean {
          expect(error).toBe(failure);
          receivedContexts.push(context);
          return attempt === 1;
        },
      },
    });
    const protectedMethod = pipe<Receiver, Args, string>(function (): string {
      throw failure;
    }, policy.operator());
    const receiver: Receiver = { prefix: 'api' };

    await expect(
      run(receiver, ['account'] as const, protectedMethod, {
        operationId: 'retry-context',
        metadata: { requestId: 'request-1' },
      }),
    ).rejects.toBe(failure);

    expect(receivedContexts).toEqual([
      {
        receiver,
        args: ['account'],
        operationId: 'retry-context',
        metadata: { requestId: 'request-1' },
        key: undefined,
        signal: undefined,
      },
      {
        receiver,
        args: ['account'],
        operationId: 'retry-context',
        metadata: { requestId: 'request-1' },
        key: undefined,
        signal: undefined,
      },
    ]);
  });

  it('does not let shouldRetry mutate the arguments used by later attempts', async () => {
    const receivedIds: string[] = [];
    const policy = definePolicy<Receiver, Args, string>({
      retry: {
        attempts: 2,
        idempotent: true,
        shouldRetry(_error, _attempt, context): boolean {
          expect(Reflect.set(context.args, 0, 'mutated')).toBe(false);
          return true;
        },
      },
    });
    const protectedMethod = pipe<Receiver, Args, string>(function (id): string {
      receivedIds.push(id);
      throw new Error('temporary failure');
    }, policy.operator());

    await expect(protectedMethod.call({ prefix: 'api' }, 'original')).rejects.toThrow(
      'temporary failure',
    );

    expect(receivedIds).toEqual(['original', 'original']);
  });

  it('stops scheduling retries after a global timeout expires', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let calls = 0;
    const policy = definePolicy<Receiver, Args, string>({
      retry: { attempts: 3, delayMs: 20, idempotent: true },
      timeout: { ms: 5, scope: 'global', abortSignal: controller.signal },
    });
    const protectedMethod = pipe<Receiver, Args, string>(async function (): Promise<string> {
      calls += 1;
      throw new Error('temporary failure');
    }, policy.operator());

    const result = protectedMethod.call({ prefix: 'api' }, 'account');
    const timeoutExpectation = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(5);
    await timeoutExpectation;
    await vi.advanceTimersByTimeAsync(100);

    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
