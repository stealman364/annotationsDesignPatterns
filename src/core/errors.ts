export type PolicyErrorCode =
  | 'POLICY_ERROR'
  | 'TIMEOUT'
  | 'RETRY_EXHAUSTED'
  | 'CIRCUIT_OPEN'
  | 'ABORTED'
  | 'INVALID_POLICY'
  | 'OVERLAP_DROPPED'
  | 'OVERLAP_QUEUE_FULL'
  | 'OVERLAP_SUPERSEDED'
  | 'KEYED_LOCK_QUEUE_FULL'
  | 'DEPENDENCY_RESOLUTION'
  | 'CIRCULAR_DEPENDENCY';

export interface PolicyErrorOptions {
  readonly code?: PolicyErrorCode;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const emptyMetadata: Readonly<Record<string, unknown>> = Object.freeze({});
const policyErrorBrand = Symbol.for('annotations-design-patterns.policy-error');

type PolicyErrorBrandCarrier = {
  readonly [key: symbol]: unknown;
};

function hasPolicyErrorBrand(value: unknown): boolean {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return false;
  }

  try {
    return (value as PolicyErrorBrandCarrier)[policyErrorBrand] === true;
  } catch {
    return false;
  }
}

/**
 * Base error for failures produced by a policy rather than by user code.
 *
 * User errors remain available as `cause`; callers can use `isPolicyError`
 * instead of matching messages or class names.
 */
export class PolicyError extends Error {
  readonly code: PolicyErrorCode;
  readonly metadata: Readonly<Record<string, unknown>>;

  /**
   * Treat base policy errors from another distribution format as instances of
   * this base class. Subclasses deliberately keep normal nominal semantics.
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    return this === PolicyError
      ? hasPolicyErrorBrand(value)
      : Function.prototype[Symbol.hasInstance].call(this, value);
  }

  constructor(message: string, options: PolicyErrorOptions = {}) {
    const { cause, code = 'POLICY_ERROR', metadata = emptyMetadata } = options;
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'PolicyError';
    this.code = code;
    this.metadata = metadata === emptyMetadata ? emptyMetadata : Object.freeze({ ...metadata });
    Object.defineProperty(this, policyErrorBrand, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
  }
}

export function isPolicyError(value: unknown): value is PolicyError {
  return hasPolicyErrorBrand(value);
}
