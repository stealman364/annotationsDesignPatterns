import { describe, expect, it } from 'vitest';
import type { EventSink, PolicyEvent } from '../../src/core/events';
import {
  combineEventSinks,
  createCounterSink,
  createSpanEventSink,
} from '../../src/observability/adapters';

const event: PolicyEvent = {
  kind: 'timeout.triggered',
  operationId: 'private-operation-id',
  operator: 'timeout',
  timestamp: 42,
  metadata: { secret: 'private metadata' },
  timeoutMs: 25,
};

describe('observability adapters', () => {
  it('bounds counter operator labels to known built-ins', () => {
    const calls: Array<[string, Readonly<{ operator: string }>]> = [];
    const sink = createCounterSink((name, labels) => calls.push([name, labels]));

    sink.emit(event);
    sink.emit({ ...event, operator: 'rateLimit' });
    sink.emit({ ...event, operator: 'user-controlled-operation-id' });

    expect(calls).toEqual([
      ['timeout.triggered', { operator: 'timeout' }],
      ['timeout.triggered', { operator: 'rateLimit' }],
      ['timeout.triggered', { operator: 'custom' }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('private-operation-id');
    expect(JSON.stringify(calls)).not.toContain('private metadata');
  });

  it('keeps the span recipe event details and isolates callback failures', () => {
    const spans: unknown[][] = [];
    const sink = createSpanEventSink((...args) => spans.push(args));
    const throwing = createSpanEventSink(() => {
      throw new Error('span backend unavailable');
    });

    expect(() => {
      sink.emit(event);
      throwing.emit(event);
    }).not.toThrow();
    expect(spans).toEqual([['timeout.triggered', { operator: 'timeout', timeoutMs: 25 }, 42]]);
  });

  it('observes accidental asynchronous callback rejection without leaking it', async () => {
    const sink = createCounterSink(() => Promise.reject(new Error('async exporter failed')));

    expect(() => sink.emit(event)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('runs every composed sink even when another throws or returns a rejecting promise', async () => {
    const calls: string[] = [];
    const sinks: EventSink[] = [
      {
        emit: () => {
          calls.push('first');
          throw new Error('first failed');
        },
      },
      {
        emit: () => {
          calls.push('second');
          return Promise.reject(new Error('second failed'));
        },
      },
      {
        emit: () => {
          calls.push('third');
        },
      },
    ];

    expect(() => combineEventSinks(...sinks).emit(event)).not.toThrow();
    expect(calls).toEqual(['first', 'second', 'third']);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('isolates a thenable whose then accessor throws', () => {
    const sink = createCounterSink(() =>
      Object.defineProperty({}, 'then', {
        get: () => {
          throw new Error('bad then getter');
        },
      }),
    );

    expect(() => sink.emit(event)).not.toThrow();
  });
});
