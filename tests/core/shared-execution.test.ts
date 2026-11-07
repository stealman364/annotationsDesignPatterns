import { describe, expect, it } from 'vitest';
import { SharedExecution } from '../../src/core/shared-execution';

describe('shared execution ownership', () => {
  it('retires before abort listeners reenter and never withdraws a member twice', async () => {
    const order: string[] = [];
    const execution = new SharedExecution<string>(() => order.push('retired'));
    execution.signal.addEventListener('abort', () => order.push('abort'));
    const caller = new AbortController();
    const result = execution.join(caller.signal);
    caller.abort('caller');
    await expect(result).rejects.toBe('caller');
    expect(order).toEqual(['retired', 'abort']);
    expect(execution.signal.aborted).toBe(true);
    let invoked = false;
    await expect(
      execution.start(() => {
        invoked = true;
        return 'unused';
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
    expect(invoked).toBe(false);
  });

  it('keeps an unsignalled consumer interested until settlement', async () => {
    const execution = new SharedExecution<string>(() => {
      throw new Error('unexpected retirement');
    });
    const caller = new AbortController();
    const a = execution.join(caller.signal);
    const b = execution.join();
    caller.abort('left');
    await expect(a).rejects.toBe('left');
    expect(execution.signal.aborted).toBe(false);
    expect(execution.start(() => 'ok')).toBe('ok');
    await expect(b).resolves.toBe('ok');
  });

  it('observes late rejection after the last member leaves', async () => {
    const execution = new SharedExecution<string>(() => undefined);
    const caller = new AbortController();
    const waiting = execution.join(caller.signal);
    let reject!: (error: unknown) => void;
    execution.start(
      () =>
        new Promise<string>((_resolve, fail) => {
          reject = fail;
        }),
    );
    caller.abort('left');
    await expect(waiting).rejects.toBe('left');
    reject(new Error('late'));
    await Promise.resolve();
  });
});
