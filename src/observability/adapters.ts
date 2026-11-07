import type { EventSink, PolicyEvent } from '../core/events';

type EventName = PolicyEvent['kind'];
type Attributes = Readonly<Record<string, string | number | boolean>>;
type CounterLabels = Readonly<{ operator: string }>;

const knownOperators = new Set([
  'retry',
  'timeout',
  'circuitBreaker',
  'memoize',
  'cachedFor',
  'fallback',
  'semaphore',
  'overlap',
  'keyedLock',
  'switchOverlap',
  'rateLimit',
]);

function boundedOperator(operator: unknown): string {
  return typeof operator === 'string' && knownOperators.has(operator) ? operator : 'custom';
}

/** Invoke instrumentation without allowing it to change application behavior. */
function callSafely<Args extends unknown[]>(
  callback: (...args: Args) => unknown,
  ...args: Args
): void {
  let result: unknown;
  try {
    result = callback(...args);
  } catch {
    return;
  }

  try {
    if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
      void Promise.resolve(result).catch(() => undefined);
    }
  } catch {
    // A thenable can throw while it is assimilated; that is still instrumentation failure.
  }
}

/**
 * Creates a callback-backed sink that emits bounded operator labels for counters.
 * Operation ids and arbitrary metadata are never included in labels.
 */
export function createCounterSink(
  increment: (name: EventName, labels: CounterLabels) => unknown,
): EventSink {
  return {
    emit(event): void {
      const labels = Object.freeze({ operator: boundedOperator(event.operator) });
      callSafely(increment, event.kind, labels);
    },
  };
}

/**
 * Creates a span event sink for a span whose lifetime remains owned by the application.
 * The library forwards the event timestamp and a small, bounded attribute set.
 */
export function createSpanEventSink(
  record: (name: EventName, attributes: Attributes, timestampMs: number) => unknown,
): EventSink {
  return {
    emit(event): void {
      const attributes: Record<string, string | number | boolean> = {
        operator: boundedOperator(event.operator),
      };
      if (event.kind === 'retry.attempt' || event.kind === 'retry.exhausted') {
        attributes.attempt = event.attempt;
      }
      if (event.kind === 'timeout.triggered') {
        attributes.timeoutMs = event.timeoutMs;
      }
      callSafely(record, event.kind, Object.freeze(attributes), event.timestamp);
    },
  };
}

/** Compose sinks while isolating each destination's synchronous and asynchronous failures. */
export function combineEventSinks(...sinks: readonly EventSink[]): EventSink {
  return {
    emit(event): void {
      for (const sink of sinks) {
        callSafely(() => sink.emit(event));
      }
    },
  };
}
