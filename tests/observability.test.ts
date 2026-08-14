import { describe, expect, it } from 'vitest';
import type { PolicyEvent } from '../src/core/events';
import { LoggerEventSink, type StructuredLogger } from '../src/observability/logger-sink';

function retryAttemptEvent(operator = 'retry'): PolicyEvent {
  return {
    kind: 'retry.attempt',
    operationId: 'operation-42',
    operator,
    timestamp: 1_700_000_000_000,
    metadata: { requestId: 'request-9' },
    attempt: 2,
  };
}

describe('LoggerEventSink', () => {
  it('forwards the complete policy event to a structured logger', () => {
    const events: PolicyEvent[] = [];
    const logger: StructuredLogger = {
      log(event): void {
        events.push(event);
      },
    };
    const sink = new LoggerEventSink(logger);
    const event = retryAttemptEvent();

    sink.emit(event);

    expect(events).toEqual([event]);
    expect(events[0]).toBe(event);
  });

  it('forwards only operators explicitly included by the opt-in filter', () => {
    const events: PolicyEvent[] = [];
    const logger: StructuredLogger = {
      log(event): void {
        events.push(event);
      },
    };
    const sink = new LoggerEventSink(logger, { operators: ['retry'] });
    const retryEvent = retryAttemptEvent('retry');
    const timeoutEvent: PolicyEvent = {
      kind: 'timeout.triggered',
      operationId: 'operation-43',
      operator: 'timeout',
      timestamp: 1_700_000_000_001,
      metadata: {},
      timeoutMs: 50,
    };

    sink.emit(timeoutEvent);
    sink.emit(retryEvent);

    expect(events).toEqual([retryEvent]);
  });

  it('isolates failures raised by the configured logger', () => {
    const logger: StructuredLogger = {
      log(): void {
        throw new Error('logger unavailable');
      },
    };
    const sink = new LoggerEventSink(logger);

    expect(() => sink.emit(retryAttemptEvent())).not.toThrow();
  });
});
