import { describe, expect, it } from 'vitest';
import { fallback, retry } from '../../src/public/operators';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

describe('functional API examples', () => {
  it('builds a synchronous pipeline with a fallback', () => {
    const safeDivide = pipe<object, readonly [divisor: number], number>(function (
      this: object,
      divisor: number,
    ): number {
      void this;
      if (divisor === 0) {
        throw new Error('division by zero');
      }
      return 100 / divisor;
    }, fallback<object, readonly [divisor: number], number>(0));

    expect(safeDivide.call({}, 4)).toBe(25);
    expect(safeDivide.call({}, 0)).toBe(0);
  });

  it('builds an asynchronous pipeline with retry', async () => {
    let attempts = 0;
    const load = pipe<object, readonly [id: string], string>(
      async function (this: object, id: string): Promise<string> {
        void this;
        attempts += 1;
        if (attempts === 1) {
          throw new Error('temporary failure');
        }
        return `loaded:${id}`;
      },
      retry<object, readonly [id: string], string>({ attempts: 2 }),
    );

    await expect(load.call({}, 'account')).resolves.toBe('loaded:account');
    expect(attempts).toBe(2);
  });

  it('runs a pipeline with an explicit receiver', () => {
    const receiver = { prefix: 'account' };
    const format = pipe<typeof receiver, readonly [id: string], string>(function (
      this: typeof receiver,
      id: string,
    ): string {
      return `${this.prefix}:${id}`;
    });

    expect(run(receiver, ['42'] as const, format)).toBe('account:42');
  });
});
