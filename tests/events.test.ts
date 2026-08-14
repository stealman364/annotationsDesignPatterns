import { describe, expect, expectTypeOf, it } from 'vitest';
import type { EventSink, PolicyEvent } from '../src/core/events';
import { NoopEventSink } from '../src/observability/noop-sink';

const requiredEventKinds = [
  'retry.attempt',
  'retry.exhausted',
  'timeout.triggered',
  'circuit.open',
  'circuit.half_open',
  'circuit.closed',
  'cache.hit',
  'cache.miss',
  'cache.rejected',
  'cache.invalidated',
  'fallback.used',
  'semaphore.queued',
  'semaphore.acquired',
  'semaphore.released',
  'overlap.started',
  'overlap.queued',
  'overlap.dropped',
  'overlap.completed',
  'keyedLock.queued',
  'keyedLock.acquired',
  'keyedLock.released',
] as const;

function assertNever(value: never): never {
  throw new TypeError(`Unexpected policy event: ${String(value)}`);
}

function describeEvent(event: PolicyEvent): string {
  switch (event.kind) {
    case 'retry.attempt':
    case 'retry.exhausted':
    case 'timeout.triggered':
    case 'circuit.open':
    case 'circuit.half_open':
    case 'circuit.closed':
    case 'cache.hit':
    case 'cache.miss':
    case 'cache.rejected':
    case 'cache.invalidated':
    case 'fallback.used':
    case 'semaphore.queued':
    case 'semaphore.acquired':
    case 'semaphore.released':
    case 'overlap.started':
    case 'overlap.queued':
    case 'overlap.dropped':
    case 'overlap.completed':
    case 'keyedLock.queued':
    case 'keyedLock.acquired':
    case 'keyedLock.released':
      return event.kind;
    default:
      return assertNever(event);
  }
}

describe('policy event contract', () => {
  it('accepts structured events with immutable shared metadata', () => {
    const event: PolicyEvent = {
      kind: 'retry.attempt',
      operationId: 'operation-42',
      operator: 'retry',
      timestamp: 1_700_000_000_000,
      metadata: { requestId: 'request-9' },
      attempt: 2,
    };

    expect(describeEvent(event)).toBe('retry.attempt');
    expect(event.metadata).toEqual({ requestId: 'request-9' });
    expectTypeOf(event.metadata).toEqualTypeOf<Readonly<Record<string, unknown>>>();

    // @ts-expect-error Event metadata must not be mutable through the public contract.
    event.metadata.requestId = 'request-10';
  });

  it('keeps the required event union exhaustive and rejects unknown kinds', () => {
    expect(requiredEventKinds).toHaveLength(21);
    expectTypeOf<(typeof requiredEventKinds)[number]>().toEqualTypeOf<PolicyEvent['kind']>();

    // @ts-expect-error Unknown event kinds must not be assignable to PolicyEvent.
    const unknownKind: PolicyEvent['kind'] = 'policy.unknown';
    void unknownKind;
  });

  it('lets the default sink ignore events without throwing', () => {
    const sink: EventSink = new NoopEventSink();
    const event: PolicyEvent = {
      kind: 'timeout.triggered',
      operationId: 'operation-43',
      operator: 'timeout',
      timestamp: 1_700_000_000_001,
      metadata: {},
      timeoutMs: 50,
    };

    expect(() => sink.emit(event)).not.toThrow();
    expect(sink.emit(event)).toBeUndefined();
  });
});
