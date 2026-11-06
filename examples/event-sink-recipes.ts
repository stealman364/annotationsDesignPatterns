// Repository recipe only. In an application import these types from
// 'annotations-design-patterns/observability'. No vendor SDK is imported here.
import type { EventSink, PolicyEvent } from '../src/observability';

type Attributes = Readonly<Record<string, string | number | boolean>>;

/** Supply a synchronous callback targeting a span whose lifetime your app owns. */
export function createSpanEventSink(
  record: (name: PolicyEvent['kind'], attributes: Attributes, timestampMs: number) => void,
): EventSink {
  return {
    emit(event): void {
      const attributes: Record<string, string | number | boolean> = { operator: event.operator };
      if (event.kind === 'retry.attempt' || event.kind === 'retry.exhausted')
        attributes.attempt = event.attempt;
      if (event.kind === 'timeout.triggered') attributes.timeoutMs = event.timeoutMs;
      try {
        record(event.kind, Object.freeze(attributes), event.timestamp);
      } catch {
        // Recording remains observational, even when the recipe is called directly.
      }
    },
  };
}

/** Wire this callback to a counter in your own metrics implementation. */
export function createCounterSink(
  increment: (name: PolicyEvent['kind'], labels: Readonly<{ operator: string }>) => void,
): EventSink {
  return {
    emit(event): void {
      try {
        increment(event.kind, Object.freeze({ operator: event.operator }));
      } catch {
        // No vendor transport or retries are introduced into the library.
      }
    },
  };
}
