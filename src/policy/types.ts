import type { MaybePromise } from '../core/types';
import type { Operator } from '../core/operator';

/** Names of the built-in policy layers. */
export type PolicyLayer = 'fallback' | 'circuitBreaker' | 'retry' | 'timeout';

/** A complete execution order for the policy layers. */
export type PolicyOrder = readonly PolicyLayer[];

/** Resolves a fallback result after the protected operation fails. */
export type FallbackProvider<Args extends readonly unknown[], Result> = (
  error: unknown,
  ...args: Args
) => MaybePromise<Result>;

export interface FallbackPolicyOptions<Args extends readonly unknown[], Result> {
  readonly value: Result | FallbackProvider<Args, Result>;
}

export interface CircuitBreakerPolicyOptions {
  readonly failures: number;
  readonly resetMs: number;
}

/** Context made available to a policy-level retry decision. */
export interface PolicyRetryContext<This, Args extends readonly unknown[]> {
  readonly receiver: This;
  readonly args: Args;
  readonly operationId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly key?: PropertyKey;
  readonly signal?: AbortSignal;
}

export interface RetryPolicyOptions<This, Args extends readonly unknown[]> {
  readonly attempts: number;
  readonly delayMs?: number;
  readonly backoffFactor?: number;
  /** Retry is opt-in only for operations explicitly declared idempotent. */
  readonly idempotent: true;
  readonly shouldRetry?: (
    error: unknown,
    attempt: number,
    context: PolicyRetryContext<This, Args>,
  ) => boolean;
}

export type TimeoutScope = 'perAttempt' | 'global';

export interface TimeoutPolicyOptions {
  readonly ms: number;
  readonly scope?: TimeoutScope;
  /** Required for a global timeout combined with retry. */
  readonly abortSignal?: AbortSignal;
}

/**
 * Complete, closed policy configuration accepted by `definePolicy`.
 *
 * `This` has a default so configurations can be named independently from a
 * particular receiver type, while `definePolicy` still preserves it.
 */
export interface PolicyConfig<Args extends readonly unknown[], Result, This = unknown> {
  readonly fallback?: false | Readonly<FallbackPolicyOptions<Args, Result>>;
  readonly circuitBreaker?: false | Readonly<CircuitBreakerPolicyOptions>;
  readonly retry?: false | Readonly<RetryPolicyOptions<This, Args>>;
  readonly timeout?: false | Readonly<TimeoutPolicyOptions>;
  readonly order?: PolicyOrder;
}

/** Closed patch format used by `DefinedPolicy.extend()`. */
export interface PolicyConfigExtension<Args extends readonly unknown[], Result, This = unknown> {
  readonly fallback?: false | Readonly<Partial<FallbackPolicyOptions<Args, Result>>>;
  readonly circuitBreaker?: false | Readonly<Partial<CircuitBreakerPolicyOptions>>;
  readonly retry?: false | Readonly<Partial<RetryPolicyOptions<This, Args>>>;
  readonly timeout?: false | Readonly<Partial<TimeoutPolicyOptions>>;
  readonly order?: PolicyOrder;
}

export interface PolicyDescriptionLayer {
  readonly name: PolicyLayer;
  readonly enabled: boolean;
  readonly options?: Readonly<Record<string, unknown>>;
}

export interface PolicyDescription {
  readonly order: PolicyOrder;
  readonly layers: readonly PolicyDescriptionLayer[];
  readonly experimental: false;
}

export interface DefinedPolicy<This, Args extends readonly unknown[], Result> {
  extend(extension: PolicyConfigExtension<Args, Result, This>): DefinedPolicy<This, Args, Result>;
  operator(): Operator<This, Args, Result, Result>;
  describe(): PolicyDescription;
}
