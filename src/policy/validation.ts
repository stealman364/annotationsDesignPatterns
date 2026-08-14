import { PolicyError } from '../core/errors';
import { isPolicyLayer, POLICY_LAYERS } from './default-order';

const policyConfigKeys = ['fallback', 'circuitBreaker', 'retry', 'timeout', 'order'] as const;
const fallbackKeys = ['value'] as const;
const circuitBreakerKeys = ['failures', 'resetMs'] as const;
const retryKeys = ['attempts', 'delayMs', 'backoffFactor', 'idempotent', 'shouldRetry'] as const;
const timeoutKeys = ['ms', 'scope', 'abortSignal'] as const;

type PolicyConfigKey = (typeof policyConfigKeys)[number];

export class InvalidPolicyError extends PolicyError {
  readonly path: string;

  constructor(path: string, message = `Invalid policy configuration at ${path}`) {
    super(message, { code: 'INVALID_POLICY', metadata: { path } });
    this.name = 'InvalidPolicyError';
    this.path = path;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  pathPrefix = '',
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new InvalidPolicyError(`${pathPrefix}${key}`);
    }
  }
}

function assertFiniteNumber(
  value: unknown,
  path: string,
  minimum: number,
  inclusive: boolean,
): void {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (inclusive ? value < minimum : value <= minimum)
  ) {
    throw new InvalidPolicyError(path);
  }
}

function validateFallback(value: unknown, requireComplete: boolean): void {
  if (value === false || value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new InvalidPolicyError('fallback');
  }
  assertKnownKeys(value, fallbackKeys, 'fallback.');
  if (requireComplete && !hasOwn(value, 'value')) {
    throw new InvalidPolicyError('fallback.value');
  }
}

function validateCircuitBreaker(value: unknown, requireComplete: boolean): void {
  if (value === false || value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new InvalidPolicyError('circuitBreaker');
  }
  assertKnownKeys(value, circuitBreakerKeys, 'circuitBreaker.');
  if (requireComplete && !hasOwn(value, 'failures')) {
    throw new InvalidPolicyError('circuitBreaker.failures');
  }
  if (requireComplete && !hasOwn(value, 'resetMs')) {
    throw new InvalidPolicyError('circuitBreaker.resetMs');
  }
  if (value.failures !== undefined) {
    assertFiniteNumber(value.failures, 'circuitBreaker.failures', 1, true);
  }
  if (value.resetMs !== undefined) {
    assertFiniteNumber(value.resetMs, 'circuitBreaker.resetMs', 0, false);
  }
}

function validateRetry(value: unknown, requireComplete: boolean): void {
  if (value === false || value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new InvalidPolicyError('retry');
  }
  assertKnownKeys(value, retryKeys, 'retry.');
  if (requireComplete && !hasOwn(value, 'attempts')) {
    throw new InvalidPolicyError('retry.attempts');
  }
  if (value.attempts !== undefined) {
    assertFiniteNumber(value.attempts, 'retry.attempts', 1, true);
  }
  if (requireComplete && value.idempotent !== true) {
    throw new InvalidPolicyError('retry.idempotent');
  }
  if (value.idempotent !== undefined && value.idempotent !== true) {
    throw new InvalidPolicyError('retry.idempotent');
  }
  if (value.delayMs !== undefined) {
    assertFiniteNumber(value.delayMs, 'retry.delayMs', 0, true);
  }
  if (value.backoffFactor !== undefined) {
    assertFiniteNumber(value.backoffFactor, 'retry.backoffFactor', 1, true);
  }
  if (value.shouldRetry !== undefined && typeof value.shouldRetry !== 'function') {
    throw new InvalidPolicyError('retry.shouldRetry');
  }
}

function isAbortSignal(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'aborted' in value &&
    typeof (value as { readonly aborted?: unknown }).aborted === 'boolean'
  );
}

function validateTimeout(value: unknown, requireComplete: boolean): void {
  if (value === false || value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    throw new InvalidPolicyError('timeout');
  }
  assertKnownKeys(value, timeoutKeys, 'timeout.');
  if (requireComplete && !hasOwn(value, 'ms')) {
    throw new InvalidPolicyError('timeout.ms');
  }
  if (value.ms !== undefined) {
    assertFiniteNumber(value.ms, 'timeout.ms', 0, false);
  }
  if (value.scope !== undefined && value.scope !== 'perAttempt' && value.scope !== 'global') {
    throw new InvalidPolicyError('timeout.scope');
  }
  if (value.abortSignal !== undefined && !isAbortSignal(value.abortSignal)) {
    throw new InvalidPolicyError('timeout.abortSignal');
  }
}

function validateOrder(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new InvalidPolicyError('order');
  }
  if (value.length !== POLICY_LAYERS.length) {
    throw new InvalidPolicyError('order');
  }
  const seen = new Set<string>();
  for (const [index, layer] of value.entries()) {
    if (!isPolicyLayer(layer) || seen.has(layer)) {
      throw new InvalidPolicyError(`order[${index}]`);
    }
    seen.add(layer);
  }
}

/** Validates the closed shape of a policy patch without requiring every option. */
export function validatePolicyConfigExtension(config: unknown): void {
  if (!isRecord(config)) {
    throw new InvalidPolicyError('policy');
  }
  assertKnownKeys(config, policyConfigKeys);
  validateFallback(config.fallback, false);
  validateCircuitBreaker(config.circuitBreaker, false);
  validateRetry(config.retry, false);
  validateTimeout(config.timeout, false);
  validateOrder(config.order);
}

/** Validates a complete policy before it can be invoked. */
export function validatePolicyConfig(config: unknown): void {
  validatePolicyConfigExtension(config);
  const record = config as Record<PolicyConfigKey, unknown>;
  validateFallback(record.fallback, true);
  validateCircuitBreaker(record.circuitBreaker, true);
  validateRetry(record.retry, true);
  validateTimeout(record.timeout, true);

  const retryEnabled = record.retry !== false && record.retry !== undefined;
  const timeout = record.timeout;
  if (
    retryEnabled &&
    isRecord(timeout) &&
    timeout.scope === 'global' &&
    !isAbortSignal(timeout.abortSignal)
  ) {
    throw new InvalidPolicyError('timeout.abortSignal');
  }
}
