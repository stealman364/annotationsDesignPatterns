import {
  createOperationContext,
  type ContextualMethod,
  type RuntimeOperationContext,
} from '../core/context';
import {
  isContextualOperator,
  withoutContext,
  type ContextualOperator,
} from '../core/contextual-operator';
import type { Operator } from '../core/operator';
import type { AnyMethod } from '../core/types';
import { circuitBreaker } from '../operators/circuit-breaker';
import { fallback } from '../operators/fallback';
import { retry } from '../operators/retry';
import { timeout } from '../operators/timeout';
import { DEFAULT_POLICY_ORDER } from './default-order';
import { mergePolicyConfig } from './merge';
import type {
  DefinedPolicy,
  PolicyConfig,
  PolicyConfigExtension,
  PolicyDescription,
  PolicyDescriptionLayer,
  PolicyLayer,
  PolicyOrder,
} from './types';
import { validatePolicyConfig } from './validation';

type PolicyOperator<This, Args extends readonly unknown[], Result> = Operator<
  This,
  Args,
  Result,
  Result
>;

function describeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'function') {
    return '[function]';
  }
  if (value === undefined) {
    return '[undefined]';
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    if (Number.isNaN(value)) {
      return '[NaN]';
    }
    return value === Number.POSITIVE_INFINITY ? '[Infinity]' : '[-Infinity]';
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (
    'aborted' in value &&
    typeof (value as { readonly aborted?: unknown }).aborted === 'boolean'
  ) {
    return '[AbortSignal]';
  }
  if (seen.has(value)) {
    return '[circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((entry) => describeValue(entry, seen));
  }
  const description: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    description[key] = describeValue((value as Record<string, unknown>)[key], seen);
  }
  return description;
}

function describeOptions(options: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const description: Record<string, unknown> = {};
  for (const key of Object.keys(options)) {
    if (options[key] !== undefined) {
      description[key] = describeValue(options[key]);
    }
  }
  return Object.freeze(description);
}

function executionOrder<This, Args extends readonly unknown[], Result>(
  config: PolicyConfig<Args, Result, This>,
): PolicyOrder {
  const order = [...(config.order ?? DEFAULT_POLICY_ORDER)];
  const timeoutOptions = config.timeout;
  const retryEnabled = config.retry !== false && config.retry !== undefined;
  if (
    retryEnabled &&
    timeoutOptions !== false &&
    timeoutOptions !== undefined &&
    timeoutOptions.scope === 'global'
  ) {
    const timeoutIndex = order.indexOf('timeout');
    const retryIndex = order.indexOf('retry');
    if (timeoutIndex > retryIndex) {
      order.splice(timeoutIndex, 1);
      order.splice(retryIndex, 0, 'timeout');
    }
  }
  return Object.freeze(order);
}

function createOperators<This, Args extends readonly unknown[], Result>(
  config: PolicyConfig<Args, Result, This>,
): readonly PolicyOperator<This, Args, Result>[] {
  const operators: PolicyOperator<This, Args, Result>[] = [];
  for (const layer of executionOrder(config)) {
    switch (layer) {
      case 'fallback': {
        const options = config.fallback;
        if (options !== false && options !== undefined) {
          operators.push(fallback<This, Args, Result>(options.value));
        }
        break;
      }
      case 'circuitBreaker': {
        const options = config.circuitBreaker;
        if (options !== false && options !== undefined) {
          operators.push(circuitBreaker<This, Args, Result>(options));
        }
        break;
      }
      case 'retry': {
        const options = config.retry;
        if (options !== false && options !== undefined) {
          operators.push(
            retry<This, Args, Result>({
              attempts: options.attempts,
              delayMs: options.delayMs,
              backoffFactor: options.backoffFactor,
              shouldRetry: options.shouldRetry,
            }),
          );
        }
        break;
      }
      case 'timeout': {
        const options = config.timeout;
        if (options !== false && options !== undefined) {
          operators.push(
            timeout<This, Args, Result>(options.ms, undefined, {
              signal: options.abortSignal,
            }),
          );
        }
        break;
      }
    }
  }
  return operators;
}

function applyContextualOperators<This, Args extends readonly unknown[], Result>(
  next: ContextualMethod<This, Args, Result>,
  operators: readonly PolicyOperator<This, Args, Result>[],
): ContextualMethod<This, Args, Result> {
  return operators.reduceRight<ContextualMethod<This, Args, Result>>((current, operator) => {
    if (isContextualOperator(operator)) {
      return operator.applyWithContext(current);
    }
    const ordinaryNext = withoutContext(current);
    const ordinaryWrapped = operator.apply(ordinaryNext);
    return function (this: This, _context, ...args: Args) {
      return ordinaryWrapped.call(this, ...args);
    };
  }, next);
}

function createContextualPolicyWrapper<This, Args extends readonly unknown[], Result>(
  next: ContextualMethod<This, Args, Result>,
  operators: readonly PolicyOperator<This, Args, Result>[],
): ContextualMethod<This, Args, Result> {
  const wrapped = applyContextualOperators(next, operators);
  return function (
    this: This,
    context: RuntimeOperationContext<This, Args> | undefined,
    ...args: Args
  ) {
    const activeContext = context ?? createOperationContext(this, args, {});
    return wrapped.call(this, activeContext, ...args);
  };
}

function layerDescription<This, Args extends readonly unknown[], Result>(
  layer: PolicyLayer,
  config: PolicyConfig<Args, Result, This>,
): PolicyDescriptionLayer {
  switch (layer) {
    case 'fallback': {
      const options = config.fallback;
      return options === false || options === undefined
        ? { name: layer, enabled: false }
        : { name: layer, enabled: true, options: describeOptions({ value: options.value }) };
    }
    case 'circuitBreaker': {
      const options = config.circuitBreaker;
      return options === false || options === undefined
        ? { name: layer, enabled: false }
        : { name: layer, enabled: true, options: describeOptions({ ...options }) };
    }
    case 'retry': {
      const options = config.retry;
      return options === false || options === undefined
        ? { name: layer, enabled: false }
        : {
            name: layer,
            enabled: true,
            options: describeOptions({
              attempts: options.attempts,
              delayMs: options.delayMs ?? 0,
              backoffFactor: options.backoffFactor ?? 1,
              idempotent: options.idempotent,
              shouldRetry: options.shouldRetry,
            }),
          };
    }
    case 'timeout': {
      const options = config.timeout;
      return options === false || options === undefined
        ? { name: layer, enabled: false }
        : {
            name: layer,
            enabled: true,
            options: describeOptions({
              ms: options.ms,
              scope: options.scope ?? 'perAttempt',
              abortSignal: options.abortSignal,
            }),
          };
    }
  }
}

function describePolicy<This, Args extends readonly unknown[], Result>(
  config: PolicyConfig<Args, Result, This>,
): PolicyDescription {
  const order = executionOrder(config);
  return Object.freeze({
    order,
    layers: Object.freeze(order.map((layer) => Object.freeze(layerDescription(layer, config)))),
    experimental: false,
  });
}

/**
 * Creates an immutable, reusable composition of the existing functional
 * resilience operators. The policy itself owns no operational state; each
 * `apply` call creates the stateful layers for one protected method.
 */
export function definePolicy<This, Args extends readonly unknown[], Result>(
  config: PolicyConfig<Args, Result, This>,
): DefinedPolicy<This, Args, Result> {
  const emptyConfig: PolicyConfig<Args, Result, This> = {};
  const canonicalConfig = mergePolicyConfig(emptyConfig, config);
  validatePolicyConfig(canonicalConfig);

  const reusableOperator: ContextualOperator<This, Args, Result, Result> = {
    name: 'policy',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      return withoutContext(
        createContextualPolicyWrapper(function (this: This, _context, ...args: Args) {
          return next.call(this, ...args);
        }, createOperators(canonicalConfig)),
      );
    },
    applyWithContext(
      next: ContextualMethod<This, Args, Result>,
    ): ContextualMethod<This, Args, Result> {
      return createContextualPolicyWrapper(next, createOperators(canonicalConfig));
    },
  };

  return Object.freeze({
    extend(
      extension: PolicyConfigExtension<Args, Result, This>,
    ): DefinedPolicy<This, Args, Result> {
      return definePolicy(mergePolicyConfig(canonicalConfig, extension));
    },
    operator(): Operator<This, Args, Result, Result> {
      return reusableOperator;
    },
    describe(): PolicyDescription {
      return describePolicy(canonicalConfig);
    },
  });
}
