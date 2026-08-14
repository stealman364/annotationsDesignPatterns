import { describe, expect, expectTypeOf, it } from 'vitest';
import * as nodeIntegration from '../../src/node';
import type { RequestContext } from '../../src/node';

describe('Node integration facade', () => {
  it('exports only the request-context functions from its opt-in source facade', () => {
    expect(Object.keys(nodeIntegration).sort()).toEqual([
      'getRequestContext',
      'runWithRequestContext',
    ]);
  });

  it('preserves a synchronous callback result without normalizing it', () => {
    const context = { requestId: 'sync-request' } as const satisfies RequestContext;
    const value = nodeIntegration.runWithRequestContext(context, () => 42);

    expect(value).toBe(42);
    expectTypeOf(value).toEqualTypeOf<number>();
  });
});
