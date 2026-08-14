import { describe, expect, expectTypeOf, it } from 'vitest';
import { getRequestContext, runWithRequestContext, type RequestContext } from '../../src/node';

describe('request context for Node', () => {
  it('is absent outside an explicitly scoped execution', () => {
    expect(getRequestContext()).toBeUndefined();
    expectTypeOf(getRequestContext()).toEqualTypeOf<Readonly<RequestContext> | undefined>();
  });

  it('propagates the readonly context through an await boundary', async () => {
    const context = {
      requestId: 'request-42',
      metadata: { tenant: 'acme' },
    } as const satisfies RequestContext;

    const result = await runWithRequestContext(context, async () => {
      expect(getRequestContext()).toEqual(context);
      await Promise.resolve();
      return getRequestContext();
    });

    expect(result).toEqual(context);
  });

  it('keeps concurrent request contexts isolated', async () => {
    const [first, second] = await Promise.all([
      runWithRequestContext({ requestId: 'first' }, async () => {
        await Promise.resolve();
        return getRequestContext()?.requestId;
      }),
      runWithRequestContext({ requestId: 'second' }, async () => {
        await Promise.resolve();
        return getRequestContext()?.requestId;
      }),
    ]);

    expect(first).toBe('first');
    expect(second).toBe('second');
  });

  it('restores the parent context after a nested scope completes', () => {
    const observed = runWithRequestContext({ requestId: 'outer' }, () => {
      const before = getRequestContext()?.requestId;
      const nested = runWithRequestContext(
        { requestId: 'inner' },
        () => getRequestContext()?.requestId,
      );
      const after = getRequestContext()?.requestId;

      return { before, nested, after };
    });

    expect(observed).toEqual({ before: 'outer', nested: 'inner', after: 'outer' });
    expect(getRequestContext()).toBeUndefined();
  });
});
