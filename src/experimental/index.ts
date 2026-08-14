/**
 * Experimental APIs are opt-in and may change independently of stable
 * entrypoints. Do not import them from the package root.
 */
export { hedge } from './hedge';
export type { HedgeOptions } from './hedge';
export { OverlapSupersededError, switchOverlap } from './switch-overlap';
export type { SwitchOverlapKeyContext, SwitchOverlapOptions } from './switch-overlap';
