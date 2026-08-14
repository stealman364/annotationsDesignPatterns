/**
 * Immutable data available to an overlap-key resolver. It mirrors the
 * invocation context without exposing the internal contextual method shape.
 */
export interface OverlapKeyContext<This, Args extends readonly unknown[]> {
  readonly receiver: This;
  readonly args: Args;
  readonly operationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export type OverlapMode = 'drop' | 'share' | 'queue';

export interface OverlapOptions<This, Args extends readonly unknown[]> {
  readonly mode: OverlapMode;
  /** Returns the state partition used to coordinate overlapping calls. */
  readonly key: (context: OverlapKeyContext<This, Args>) => PropertyKey;
  /** Maximum waiting calls per key. The active call does not count toward it. */
  readonly maxQueue?: number;
}
