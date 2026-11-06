import { describe, expect, it } from 'vitest';
import type { ContextualMethod } from '../../src/core/context';
import type { ContextualOperator } from '../../src/core/contextual-operator';
import type { PolicyEvent } from '../../src/core/events';
import type { Operator } from '../../src/core/operator';
import { memoize } from '../../src/operators/memoize';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

type NoArgs = readonly [];

function recordingOptions(events: PolicyEvent[]) {
  return {
    operationId: 'caller',
    eventSink: {
      emit(event: PolicyEvent): void {
        events.push(event);
      },
    },
  };
}

describe('mixed contextual composition', () => {
  it('preserves context through a plain identity operator', () => {
    const events: PolicyEvent[] = [];
    const identity: Operator<object, NoArgs, string, string> = {
      name: 'identity',
      apply: (next) => next,
    };
    const operation = pipe(() => 'value', identity, memoize<object, NoArgs, string>());
    expect(run({}, [], operation, recordingOptions(events))).toBe('value');
    expect(events.map(({ kind }) => kind)).toEqual(['cache.miss']);
  });

  it('preserves context through a nested pipeline used as the base', () => {
    const events: PolicyEvent[] = [];
    const inner = pipe(() => 'value', memoize<object, NoArgs, string>());
    const outer = pipe(inner);
    expect(run({}, [], outer, recordingOptions(events))).toBe('value');
    expect(events.map(({ kind }) => kind)).toEqual(['cache.miss']);
  });

  it('forwards inner context after await when the wrapper supports applyWithContext', async () => {
    const events: PolicyEvent[] = [];
    const cooperative: ContextualOperator<object, NoArgs, string, string> = {
      name: 'cooperative',
      apply(next) {
        return async function (this: object) {
          await Promise.resolve();
          return next.call(this);
        };
      },
      applyWithContext(next) {
        return async function (this: object, context) {
          await Promise.resolve();
          return next.call(this, context);
        };
      },
    };
    const operation = pipe(() => 'value', cooperative, memoize<object, NoArgs, string>());
    await expect(run({}, [], operation, recordingOptions(events))).resolves.toBe('value');
    expect(events).toEqual([
      expect.objectContaining({ kind: 'cache.miss', operationId: 'caller' }),
    ]);
  });

  it('applies stateful plain operators once and preserves state across calls', () => {
    let applications = 0;
    const stateful: Operator<object, NoArgs, string, string> = {
      name: 'stateful',
      apply(next) {
        applications += 1;
        let calls = 0;
        return function (this: object): string {
          calls += 1;
          return `${next.call(this)}:${calls}`;
        };
      },
    };
    const events: PolicyEvent[] = [];
    const operation = pipe(() => 'value', memoize<object, NoArgs, string>(), stateful);
    expect(applications).toBe(1);
    expect(run({}, [], operation, recordingOptions(events))).toBe('value:1');
    expect(run({}, [], operation, recordingOptions(events))).toBe('value:1');
    expect(events.map(({ kind }) => kind)).toEqual(['cache.miss', 'cache.hit']);
    expect(applications).toBe(1);
    // Without memoization a plain layer still retains its one applied closure.
    const plain = pipe(() => 'value', stateful);
    expect(plain.call({})).toBe('value:1');
    expect(plain.call({})).toBe('value:2');
    expect(applications).toBe(2);
  });

  it('isolates concurrent outer contexts while treating an opaque async wrapper as an inner boundary', async () => {
    const observations: Array<readonly [string, string, string | undefined]> = [];
    function observe(name: string): ContextualOperator<object, NoArgs, string, string> {
      const wrap = (
        next: ContextualMethod<object, NoArgs, string>,
      ): ContextualMethod<object, NoArgs, string> =>
        async function (this: object, context): Promise<string> {
          observations.push([name, 'start', context?.operationId]);
          const result = await next.call(this, context);
          observations.push([name, 'done', context?.operationId]);
          return result;
        };
      return {
        name,
        apply(next) {
          const wrapped = wrap(function (this: object) {
            return next.call(this);
          });
          return function (this: object) {
            return wrapped.call(this, undefined);
          };
        },
        applyWithContext: wrap,
      };
    }
    let applications = 0;
    const opaque: Operator<object, NoArgs, string, string> = {
      name: 'opaque',
      apply(next) {
        applications += 1;
        return async function (this: object) {
          await Promise.resolve();
          return next.call(this);
        };
      },
    };
    const completions: Array<(value: string) => void> = [];
    const operation = pipe(
      () =>
        new Promise<string>((resolve) => {
          completions.push(resolve);
        }),
      observe('outer'),
      opaque,
      observe('inner'),
    );
    const receiver = {};
    const first = run(receiver, [], operation, { operationId: 'first' });
    const second = run(receiver, [], operation, { operationId: 'second' });
    await Promise.resolve();
    expect(completions).toHaveLength(2);
    completions[1]?.('second result');
    await expect(second).resolves.toBe('second result');
    completions[0]?.('first result');
    await expect(first).resolves.toBe('first result');
    expect(applications).toBe(1);
    expect(observations.filter(([name]) => name === 'outer')).toEqual([
      ['outer', 'start', 'first'],
      ['outer', 'start', 'second'],
      ['outer', 'done', 'second'],
      ['outer', 'done', 'first'],
    ]);
    // An ordinary wrapper has no context argument to forward across its await.
    // To retain INNER context it must cooperate via applyWithContext instead.
    expect(observations.filter(([name]) => name === 'inner')).toEqual([
      ['inner', 'start', undefined],
      ['inner', 'start', undefined],
      ['inner', 'done', undefined],
      ['inner', 'done', undefined],
    ]);
  });
});
