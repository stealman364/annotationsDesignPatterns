import type { PolicyConfig, PolicyConfigExtension } from './types';
import { validatePolicyConfigExtension } from './validation';

const layerNames = ['fallback', 'circuitBreaker', 'retry', 'timeout'] as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneLayer(value: unknown): unknown {
  return isRecord(value) ? { ...value } : value;
}

function mergeLayer(base: unknown, extension: unknown): unknown {
  if (extension === undefined) {
    return cloneLayer(base);
  }
  if (extension === false) {
    return false;
  }
  if (isRecord(extension)) {
    return {
      ...(isRecord(base) ? base : {}),
      ...extension,
    };
  }
  return extension;
}

/**
 * Merges only the known policy schema. Nested layer options are cloned, while
 * arrays such as `order` are replaced rather than concatenated.
 */
export function mergePolicyConfig<Args extends readonly unknown[], Result, This = unknown>(
  base: PolicyConfig<Args, Result, This>,
  extension: PolicyConfigExtension<Args, Result, This>,
): PolicyConfig<Args, Result, This> {
  validatePolicyConfigExtension(base);
  validatePolicyConfigExtension(extension);

  const baseRecord = base as UnknownRecord;
  const extensionRecord = extension as UnknownRecord;
  const merged: UnknownRecord = {};

  for (const layer of layerNames) {
    const value = mergeLayer(baseRecord[layer], extensionRecord[layer]);
    if (value !== undefined) {
      merged[layer] = value;
    }
  }

  const order = extension.order ?? base.order;
  if (order !== undefined) {
    merged.order = [...order];
  }

  return merged as PolicyConfig<Args, Result, This>;
}
