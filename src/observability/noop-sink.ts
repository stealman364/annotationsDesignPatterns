import type { EventSink, PolicyEvent } from '../core/events';

/** Default event sink. It deliberately performs no allocation or callback. */
export class NoopEventSink implements EventSink {
  emit(event: PolicyEvent): void {
    void event;
  }
}
