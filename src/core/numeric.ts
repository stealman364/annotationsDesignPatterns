/** Largest delay supported consistently by setTimeout implementations. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Timer delays may be fractional; zero is an API-specific choice. */
export function isTimerDelay(value: unknown, allowZero: boolean): value is number {
  return isDuration(value, allowZero) && value <= MAX_TIMER_DELAY_MS;
}

/** Elapsed-time windows do not have the platform timer's upper bound. */
export function isDuration(value: unknown, allowZero: boolean): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0)
  );
}

/** Lazy TTLs support Infinity to represent entries that do not expire. */
export function isTtl(value: unknown, allowZero: boolean): value is number {
  return value === Infinity || isDuration(value, allowZero);
}

export function isCount(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

export function isBackoffFactor(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1;
}
