import { describe, expect, it } from 'vitest';
import { Retry } from '../../src/patterns/utility/retry';

describe('characterization: B2 @Retry numeric inputs', () => {
  it('rejects NaN attempts', () => {
    expect(() => Retry({ attempts: Number.NaN })).toThrow(RangeError);
  });

  it('rejects Infinity attempts', () => {
    expect(() => Retry({ attempts: Infinity })).toThrow(RangeError);
  });

  it.each([-1, Number.NaN, Infinity])('rejects negative or non-finite delayMs: %s', (delayMs) => {
    expect(() => Retry({ attempts: 2, delayMs })).toThrow(RangeError);
  });

  it.each([0, -1, Number.NaN, Infinity])(
    'rejects a backoffFactor below one or non-finite: %s',
    (backoffFactor) => {
      expect(() => Retry({ attempts: 2, backoffFactor })).toThrow(RangeError);
    },
  );
});
