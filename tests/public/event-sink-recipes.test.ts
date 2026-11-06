import { describe, expect, it, vi } from 'vitest';
import { createCounterSink, createSpanEventSink } from '../../examples/event-sink-recipes';
import type { PolicyEvent } from '../../src/observability';

const timeout: PolicyEvent = {
  kind: 'timeout.triggered',
  operator: 'timeout',
  operationId: 'request-1',
  timestamp: 100,
  metadata: { tenant: 'unbounded-id' },
  timeoutMs: 50,
};

describe('external event sink recipes', () => {
  it('maps existing events to a caller-owned span without ending it or forwarding metadata', () => {
    const record = vi.fn();
    createSpanEventSink(record).emit(timeout);
    expect(record).toHaveBeenCalledWith(
      'timeout.triggered',
      { operator: 'timeout', timeoutMs: 50 },
      100,
    );
    expect(Object.isFrozen(record.mock.calls[0]![1])).toBe(true);
  });

  it('records counters with bounded event names and only an operator label', () => {
    const increment = vi.fn();
    createCounterSink(increment).emit(timeout);
    expect(increment).toHaveBeenCalledWith('timeout.triggered', { operator: 'timeout' });
  });

  it('isolates synchronous vendor callback errors', () => {
    const fail = () => {
      throw new Error('vendor unavailable');
    };
    expect(() => createCounterSink(fail).emit(timeout)).not.toThrow();
    expect(() => createSpanEventSink(fail).emit(timeout)).not.toThrow();
  });

  it('includes attempt information only on retry events', () => {
    const record = vi.fn();
    const sink = createSpanEventSink(record);
    sink.emit({
      kind: 'retry.attempt',
      operator: 'retry',
      operationId: 'id',
      metadata: {},
      timestamp: 10,
      attempt: 2,
    });
    sink.emit({
      kind: 'cache.hit',
      operator: 'memoize',
      operationId: 'id',
      metadata: {},
      timestamp: 11,
    });
    expect(record.mock.calls).toEqual([
      ['retry.attempt', { operator: 'retry', attempt: 2 }, 10],
      ['cache.hit', { operator: 'memoize' }, 11],
    ]);
  });
});
