import type { PolicyLayer, PolicyOrder } from './types';

export const POLICY_LAYERS = Object.freeze([
  'fallback',
  'circuitBreaker',
  'retry',
  'timeout',
] as const);

export const DEFAULT_POLICY_ORDER: PolicyOrder = Object.freeze([...POLICY_LAYERS]);

export function isPolicyLayer(value: unknown): value is PolicyLayer {
  return typeof value === 'string' && (POLICY_LAYERS as readonly string[]).includes(value);
}
