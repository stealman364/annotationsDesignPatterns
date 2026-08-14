export interface PolicyEventBase {
  readonly operationId: string;
  readonly operator: string;
  /** Unix epoch time in milliseconds, captured when the event is emitted. */
  readonly timestamp: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface RetryAttemptEvent extends PolicyEventBase {
  readonly kind: 'retry.attempt';
  readonly attempt: number;
}

export interface RetryExhaustedEvent extends PolicyEventBase {
  readonly kind: 'retry.exhausted';
  readonly attempt: number;
  readonly error: unknown;
}

export interface TimeoutTriggeredEvent extends PolicyEventBase {
  readonly kind: 'timeout.triggered';
  readonly timeoutMs: number;
}

export interface CircuitOpenEvent extends PolicyEventBase {
  readonly kind: 'circuit.open';
}

export interface CircuitHalfOpenEvent extends PolicyEventBase {
  readonly kind: 'circuit.half_open';
}

export interface CircuitClosedEvent extends PolicyEventBase {
  readonly kind: 'circuit.closed';
}

export interface CacheHitEvent extends PolicyEventBase {
  readonly kind: 'cache.hit';
}

export interface CacheMissEvent extends PolicyEventBase {
  readonly kind: 'cache.miss';
}

export interface CacheRejectedEvent extends PolicyEventBase {
  readonly kind: 'cache.rejected';
  readonly error: unknown;
}

export interface CacheInvalidatedEvent extends PolicyEventBase {
  readonly kind: 'cache.invalidated';
  readonly key: string;
}

export interface FallbackUsedEvent extends PolicyEventBase {
  readonly kind: 'fallback.used';
  readonly error: unknown;
}

export interface SemaphoreQueuedEvent extends PolicyEventBase {
  readonly kind: 'semaphore.queued';
}

export interface SemaphoreAcquiredEvent extends PolicyEventBase {
  readonly kind: 'semaphore.acquired';
}

export interface SemaphoreReleasedEvent extends PolicyEventBase {
  readonly kind: 'semaphore.released';
}

export interface OverlapStartedEvent extends PolicyEventBase {
  readonly kind: 'overlap.started';
  readonly key: PropertyKey;
}

export interface OverlapQueuedEvent extends PolicyEventBase {
  readonly kind: 'overlap.queued';
  readonly key: PropertyKey;
}

export interface OverlapDroppedEvent extends PolicyEventBase {
  readonly kind: 'overlap.dropped';
  readonly key: PropertyKey;
}

export interface OverlapCompletedEvent extends PolicyEventBase {
  readonly kind: 'overlap.completed';
  readonly key: PropertyKey;
}

export interface KeyedLockQueuedEvent extends PolicyEventBase {
  readonly kind: 'keyedLock.queued';
  readonly key: PropertyKey;
}

export interface KeyedLockAcquiredEvent extends PolicyEventBase {
  readonly kind: 'keyedLock.acquired';
  readonly key: PropertyKey;
}

export interface KeyedLockReleasedEvent extends PolicyEventBase {
  readonly kind: 'keyedLock.released';
  readonly key: PropertyKey;
}

export type PolicyEvent =
  | RetryAttemptEvent
  | RetryExhaustedEvent
  | TimeoutTriggeredEvent
  | CircuitOpenEvent
  | CircuitHalfOpenEvent
  | CircuitClosedEvent
  | CacheHitEvent
  | CacheMissEvent
  | CacheRejectedEvent
  | CacheInvalidatedEvent
  | FallbackUsedEvent
  | SemaphoreQueuedEvent
  | SemaphoreAcquiredEvent
  | SemaphoreReleasedEvent
  | OverlapStartedEvent
  | OverlapQueuedEvent
  | OverlapDroppedEvent
  | OverlapCompletedEvent
  | KeyedLockQueuedEvent
  | KeyedLockAcquiredEvent
  | KeyedLockReleasedEvent;

export interface EventSink {
  emit(event: PolicyEvent): void;
}
