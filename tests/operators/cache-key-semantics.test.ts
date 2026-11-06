import { describe, expect, it } from 'vitest';
import { memoize } from '../../src/operators/memoize';
import { cachedFor } from '../../src/operators/cached-for';

type Args = readonly [value: unknown];

const collisionPairs: ReadonlyArray<readonly [label: string, first: unknown, second: unknown]> = [
  ['undefined/null', undefined, null],
  ['NaN/null', NaN, null],
  ['Infinity/null', Infinity, null],
  ['-Infinity/null', -Infinity, null],
  ['Symbol/null', Symbol('value'), null],
  ['function/null', () => 1, null],
  ['negative/positive zero', -0, 0],
  ['undefined object property', { value: undefined }, {}],
  ['symbol object property', { value: Symbol('value') }, {}],
  ['function object property', { value: () => 1 }, {}],
  ['symbol object key', { [Symbol('key')]: 1 }, {}],
  ['Map/plain object', new Map([['key', 1]]), {}],
  ['Set/plain object', new Set([1]), {}],
  ['Date/ISO string', new Date('2026-01-01T00:00:00Z'), '2026-01-01T00:00:00.000Z'],
  ['invalid Date/null', new Date(NaN), null],
  ['array holes/null', Array(1), [null]],
  ['array undefined/null', [undefined], [null]],
  ['structurally equal objects', { a: 1, b: 2 }, { a: 1, b: 2 }],
  ['custom toJSON', { toJSON: () => 'custom' }, 'custom'],
];

describe.each(['memoize', 'cachedFor'] as const)('%s default JSON argument keys', (kind) => {
  const create = (key?: (value: unknown) => string) =>
    kind === 'memoize'
      ? memoize<object, Args, number>({ key })
      : cachedFor<object, Args, number>(Infinity, { key });

  it.each(collisionPairs)('characterizes the existing %s equivalence', (_label, first, second) => {
    let calls = 0;
    const operation = create().apply(() => ++calls);
    expect(operation.call({}, first)).toBe(1);
    expect(operation.call({}, second)).toBe(1);
    expect(calls).toBe(1);
  });

  it.each([
    ['string/number', '1', 1],
    ['array order', [1, 2], [2, 1]],
    ['object insertion order', { a: 1, b: 2 }, { b: 2, a: 1 }],
    ['array/plain object', [], {}],
  ])('preserves distinct keys for %s', (_label, first, second) => {
    let calls = 0;
    const operation = create().apply(() => ++calls);
    expect(operation.call({}, first)).toBe(1);
    expect(operation.call({}, second)).toBe(2);
  });

  it('rejects BigInt and cycles before invoking the operation', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let calls = 0;
    const operation = create().apply(() => ++calls);
    expect(() => operation.call({}, 1n)).toThrow(TypeError);
    expect(() => operation.call({}, cyclic)).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('propagates a failing toJSON rather than caching an incorrect key', () => {
    const failure = new Error('toJSON failed');
    let calls = 0;
    const operation = create().apply(() => ++calls);
    expect(() =>
      operation.call(
        {},
        {
          toJSON() {
            throw failure;
          },
        },
      ),
    ).toThrow(failure);
    expect(calls).toBe(0);
  });

  it('uses a custom string key as the explicit escape hatch for special values and identity', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const symbol = Symbol('unique');
    const object = {};
    const values = [undefined, null, NaN, Infinity, 1n, symbol, cyclic, object];
    const keys = new Map<unknown, string>(values.map((value, index) => [value, `key-${index}`]));
    let calls = 0;
    const operation = create((value) => keys.get(value) ?? 'other').apply(() => ++calls);
    values.forEach((value, index) => expect(operation.call({}, value)).toBe(index + 1));
    values.forEach((value, index) => expect(operation.call({}, value)).toBe(index + 1));
    expect(calls).toBe(values.length);
  });
});
