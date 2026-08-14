import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import type { AnyMethod } from '../../src/core/types';
import { cachedFor } from '../../src/operators/cached-for';
import { circuitBreaker } from '../../src/operators/circuit-breaker';
import { fallback } from '../../src/operators/fallback';
import { memoize } from '../../src/operators/memoize';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

interface Receiver {
  readonly prefix: string;
}

type Args = readonly [id: string];
type NoArgs = readonly [];

interface RunContext {
  readonly operationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly eventSink: EventSink;
}

function createRecordingContext(
  operationId: string,
  metadata: Readonly<Record<string, unknown>>,
  events: PolicyEvent[],
): RunContext {
  return {
    operationId,
    metadata,
    eventSink: {
      emit(event): void {
        events.push(event);
      },
    },
  };
}

function expectEventContext(
  events: ReadonlyArray<PolicyEvent>,
  operationId: string,
  metadata: Readonly<Record<string, unknown>>,
): void {
  for (const event of events) {
    expect(event.operationId).toBe(operationId);
    expect(event.metadata).toEqual(metadata);
    expect(event.timestamp).toEqual(expect.any(Number));
  }
}

describe('operator observability events through pipe and run', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits one circuit transition sequence for a single half-open probe', async () => {
    vi.useFakeTimers();
    const failure = new Error('unavailable');
    const events: PolicyEvent[] = [];
    const metadata = { requestId: 'circuit-request' } as const;
    const context = createRecordingContext('circuit-operation', metadata, events);
    let calls = 0;
    let resolveProbe!: (value: string) => void;
    const method: AnyMethod<Receiver, NoArgs, string> = function (): Promise<string> {
      calls += 1;
      if (calls === 1) {
        return Promise.reject(failure);
      }
      return new Promise((resolve) => {
        resolveProbe = resolve;
      });
    };
    const protectedMethod = pipe(
      method,
      circuitBreaker<Receiver, NoArgs, string>({ failures: 1, resetMs: 100 }),
    );
    const receiver: Receiver = { prefix: 'api' };

    await expect(run(receiver, [] as const, protectedMethod, context)).rejects.toBe(failure);

    await vi.advanceTimersByTimeAsync(100);

    const probe = run(receiver, [] as const, protectedMethod, context);
    const concurrentCall = run(receiver, [] as const, protectedMethod, context);

    await expect(concurrentCall).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(calls).toBe(2);

    resolveProbe('recovered');
    await expect(probe).resolves.toBe('recovered');

    expect(events.map((event) => event.kind)).toEqual([
      'circuit.open',
      'circuit.half_open',
      'circuit.closed',
    ]);
    expect(events.filter((event) => event.kind === 'circuit.half_open')).toHaveLength(1);
    expect(events.map((event) => event.operator)).toEqual([
      'circuitBreaker',
      'circuitBreaker',
      'circuitBreaker',
    ]);
    expectEventContext(events, 'circuit-operation', metadata);
  });

  it('emits fallback.used without changing the recovered result', () => {
    const failure = new Error('unavailable');
    const events: PolicyEvent[] = [];
    const metadata = { requestId: 'fallback-request' } as const;
    const context = createRecordingContext('fallback-operation', metadata, events);
    const method: AnyMethod<Receiver, Args, string> = function (): string {
      throw failure;
    };
    const recovered = pipe(method, fallback<Receiver, Args, string>('recovered'));

    expect(run({ prefix: 'api' }, ['account'] as const, recovered, context)).toBe('recovered');
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'fallback.used',
        operator: 'fallback',
        operationId: 'fallback-operation',
        metadata,
        error: failure,
      }),
    ]);
    expectEventContext(events, 'fallback-operation', metadata);
  });

  it('emits memoize cache misses, hits, and rejected entries for one run context', async () => {
    const failure = new Error('temporary failure');
    const events: PolicyEvent[] = [];
    const metadata = { requestId: 'memoize-request' } as const;
    const context = createRecordingContext('memoize-operation', metadata, events);
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string | Promise<string> {
      calls += 1;
      return id === 'unstable' ? Promise.reject(failure) : `${this.prefix}:${id}:${calls}`;
    };
    const memoized = pipe(method, memoize<Receiver, Args, string>());
    const receiver: Receiver = { prefix: 'api' };

    expect(run(receiver, ['account'] as const, memoized, context)).toBe('api:account:1');
    expect(run(receiver, ['account'] as const, memoized, context)).toBe('api:account:1');
    await expect(run(receiver, ['unstable'] as const, memoized, context)).rejects.toBe(failure);

    expect(calls).toBe(2);
    expect(events.map((event) => event.kind)).toEqual([
      'cache.miss',
      'cache.hit',
      'cache.miss',
      'cache.rejected',
    ]);
    expect(events.map((event) => event.operator)).toEqual([
      'memoize',
      'memoize',
      'memoize',
      'memoize',
    ]);
    const rejectedEvent = events.at(-1);
    expect(rejectedEvent?.kind).toBe('cache.rejected');
    if (rejectedEvent?.kind === 'cache.rejected') {
      expect(rejectedEvent.error).toBe(failure);
    }
    expectEventContext(events, 'memoize-operation', metadata);
  });

  it('emits cachedFor cache misses, hits, and rejected entries for one run context', async () => {
    const failure = new Error('temporary failure');
    const events: PolicyEvent[] = [];
    const metadata = { requestId: 'cached-for-request' } as const;
    const context = createRecordingContext('cached-for-operation', metadata, events);
    let calls = 0;
    const method: AnyMethod<Receiver, Args, string> = function (
      this: Receiver,
      id: string,
    ): string | Promise<string> {
      calls += 1;
      return id === 'unstable' ? Promise.reject(failure) : `${this.prefix}:${id}:${calls}`;
    };
    const cached = pipe(method, cachedFor<Receiver, Args, string>(1_000));
    const receiver: Receiver = { prefix: 'api' };

    expect(run(receiver, ['account'] as const, cached, context)).toBe('api:account:1');
    expect(run(receiver, ['account'] as const, cached, context)).toBe('api:account:1');
    await expect(run(receiver, ['unstable'] as const, cached, context)).rejects.toBe(failure);

    expect(calls).toBe(2);
    expect(events.map((event) => event.kind)).toEqual([
      'cache.miss',
      'cache.hit',
      'cache.miss',
      'cache.rejected',
    ]);
    expect(events.map((event) => event.operator)).toEqual([
      'cachedFor',
      'cachedFor',
      'cachedFor',
      'cachedFor',
    ]);
    const rejectedEvent = events.at(-1);
    expect(rejectedEvent?.kind).toBe('cache.rejected');
    if (rejectedEvent?.kind === 'cache.rejected') {
      expect(rejectedEvent.error).toBe(failure);
    }
    expectEventContext(events, 'cached-for-operation', metadata);
  });
});
