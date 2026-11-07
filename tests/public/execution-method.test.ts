import { describe, expect, expectTypeOf, it } from 'vitest';
import { executionMethod } from '../../src/public/run';
import { pipe } from '../../src/public/pipe';
import { timeout } from '../../src/operators/timeout';

describe('executionMethod', () => {
  it('preserves receiver, typed arguments and synchronous results without a context', () => {
    const method = executionMethod(function (this: { prefix: string }, execution, id: string) {
      expect(execution.signal).toBeUndefined();
      expect(execution.operationId).toBeUndefined();
      expect(Object.isFrozen(execution)).toBe(true);
      expect(Object.isFrozen(execution.args)).toBe(true);
      return this.prefix + id;
    });
    expectTypeOf(method.call({ prefix: 'a' }, 'b')).toEqualTypeOf<string>();
    expect(method.call({ prefix: 'a' }, 'b')).toBe('ab');
  });

  it('exposes the effective timeout signal through a functional pipeline', async () => {
    let effective: AbortSignal | undefined;
    const method = executionMethod((execution) => {
      effective = execution.signal;
      return 'ok';
    });
    expect(await pipe(method, timeout(100))()).toBe('ok');
    expect(effective).toBeInstanceOf(AbortSignal);
  });

  it('preserves the original promise and throw on direct invocation', () => {
    const pending = Promise.resolve(1);
    expect(executionMethod(() => pending)()).toBe(pending);
    const error = new Error('business');
    expect(() =>
      executionMethod(() => {
        throw error;
      })(),
    ).toThrow(error);
  });
});
