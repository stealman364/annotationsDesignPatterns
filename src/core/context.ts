import type { EventSink, PolicyEvent, PolicyEventBase } from './events';
import type { MaybePromise } from './types';

export interface OperationContextOptions {
  readonly operationId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly eventSink?: EventSink;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export interface RuntimeOperationContext<This, Args extends readonly unknown[]> {
  readonly receiver: This;
  readonly args: Args;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
  readonly operationId: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly eventSink?: EventSink;
}

export type ContextualMethod<This, Args extends readonly unknown[], Result> = (
  this: This,
  context: RuntimeOperationContext<This, Args> | undefined,
  ...args: Args
) => MaybePromise<Result>;

type PolicyEventKind = PolicyEvent['kind'];
type PolicyEventPayload<Kind extends PolicyEventKind> = Omit<
  Extract<PolicyEvent, { readonly kind: Kind }>,
  keyof PolicyEventBase | 'kind'
>;

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});
let operationSequence = 0;

function nextOperationId(): string {
  operationSequence += 1;
  return `operation-${operationSequence}`;
}

export function createOperationContext<This, Args extends readonly unknown[]>(
  receiver: This,
  args: Args,
  options: OperationContextOptions,
): RuntimeOperationContext<This, Args> {
  const metadata =
    options.metadata === undefined ? emptyMetadata : Object.freeze({ ...options.metadata });
  const contextualArgs = Object.freeze([...args]) as unknown as Args;

  return Object.freeze({
    receiver,
    args: contextualArgs,
    key: options.key,
    signal: options.signal,
    operationId: options.operationId ?? nextOperationId(),
    metadata,
    eventSink: options.eventSink,
  });
}

/**
 * Emits an event only for an explicitly configured sink. Observability must
 * never replace the value or error produced by the policy itself.
 */
export function emitPolicyEvent<Kind extends PolicyEventKind>(
  context:
    | Pick<
        RuntimeOperationContext<unknown, readonly unknown[]>,
        'operationId' | 'metadata' | 'eventSink'
      >
    | undefined,
  operator: string,
  kind: Kind,
  payload: PolicyEventPayload<Kind>,
): void {
  if (context === undefined || context.eventSink === undefined) {
    return;
  }
  const sink = context.eventSink;

  const event = {
    kind,
    operationId: context.operationId,
    operator,
    timestamp: Date.now(),
    metadata: context.metadata,
    ...payload,
  } as PolicyEvent;

  try {
    sink.emit(event);
  } catch {
    // Event sinks are observational. A logger/backend failure is isolated.
  }
}
