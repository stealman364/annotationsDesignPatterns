import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import { retry } from '../../src/operators/retry';
import { TimeoutError, timeout } from '../../src/operators/timeout';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';
import type { AnyMethod } from '../../src/public/types';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createCapturingSink(events: PolicyEvent[]): EventSink {
  return {
    emit(event): void {
      events.push(event);
    },
  };
}

describe('operator policy events', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits every retry attempt followed by exhaustion with one correlated context', async () => {
    const receiver: Receiver = { prefix: 'api' };
    const args: Args = ['account'];
    const metadata = { requestId: 'request-17', tenant: 'acme' } as const;
    const failure = new Error('dependency unavailable');
    const events: PolicyEvent[] = [];
    const calls: Array<readonly [Receiver, string]> = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      calls.push([this, id]);
      throw failure;
    };
    const operation = pipe(method, retry<Receiver, Args, string>({ attempts: 3 }));

    const result = run(receiver, args, operation, {
      operationId: 'retry-operation-17',
      metadata,
      eventSink: createCapturingSink(events),
    });

    await expect(result).rejects.toBe(failure);

    expect(calls).toEqual([
      [receiver, 'account'],
      [receiver, 'account'],
      [receiver, 'account'],
    ]);
    expect(events.map((event) => event.kind)).toEqual([
      'retry.attempt',
      'retry.attempt',
      'retry.attempt',
      'retry.exhausted',
    ]);
    expect(
      events.map((event) => {
        if (event.kind === 'retry.attempt' || event.kind === 'retry.exhausted') {
          return event.attempt;
        }
        throw new TypeError(`Unexpected event: ${event.kind}`);
      }),
    ).toEqual([1, 2, 3, 3]);
    for (const event of events) {
      expect(event.operationId).toBe('retry-operation-17');
      expect(event.operator).toBe('retry');
      expect(event.metadata).toEqual(metadata);
      expect(Number.isFinite(event.timestamp)).toBe(true);
    }
    const exhausted = events.at(-1);
    expect(exhausted).toMatchObject({ error: failure });
  });

  it('isolates a failing sink while retry preserves its successful result and invocation', async () => {
    const receiver: Receiver = { prefix: 'api' };
    const events: PolicyEvent[] = [];
    const observationFailure = new Error('event backend unavailable');
    let attempts = 0;
    const calls: Array<readonly [Receiver, string]> = [];
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string {
      attempts += 1;
      calls.push([this, id]);
      if (attempts === 1) {
        throw new Error('temporary failure');
      }
      return `${this.prefix}:${id}`;
    };
    const operation = pipe(method, retry<Receiver, Args, string>({ attempts: 2 }));
    const sink: EventSink = {
      emit(event): void {
        events.push(event);
        throw observationFailure;
      },
    };

    await expect(
      run(receiver, ['account'] as const, operation, {
        operationId: 'retry-operation-18',
        metadata: { requestId: 'request-18' },
        eventSink: sink,
      }),
    ).resolves.toBe('api:account');

    expect(calls).toEqual([
      [receiver, 'account'],
      [receiver, 'account'],
    ]);
    expect(events.map((event) => event.kind)).toEqual(['retry.attempt', 'retry.attempt']);
  });

  it('emits timeout.triggered once and keeps TimeoutError when its sink fails', async () => {
    vi.useFakeTimers();
    const receiver: Receiver = { prefix: 'api' };
    const metadata = { requestId: 'request-19' } as const;
    const events: PolicyEvent[] = [];
    const observationFailure = new Error('event backend unavailable');
    const calls: Array<readonly [Receiver, string]> = [];
    const method: AnyMethod<Receiver, Args, string> = async function (
      this: Receiver,
      id: string,
    ): Promise<string> {
      calls.push([this, id]);
      await wait(20);
      return `${this.prefix}:${id}`;
    };
    const operation = pipe(method, timeout<Receiver, Args, string>(10));
    const sink: EventSink = {
      emit(event): void {
        events.push(event);
        throw observationFailure;
      },
    };

    const result = run(receiver, ['account'] as const, operation, {
      operationId: 'timeout-operation-19',
      metadata,
      eventSink: sink,
    });

    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toEqual([[receiver, 'account']]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'timeout.triggered',
      operationId: 'timeout-operation-19',
      operator: 'timeout',
      metadata,
      timeoutMs: 10,
    });
    expect(Number.isFinite(events[0]?.timestamp)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
