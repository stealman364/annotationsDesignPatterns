import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateMachine, TransitionTo } from '../../src/patterns/behavioral/state-machine';
import { Timeout } from '../../src/patterns/utility/timeout';

describe('characterization: async decorators', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('B1: @TransitionTo changes state immediately while an async method is pending', async () => {
    let resolveRun: ((value: string) => void) | undefined;

    class Job extends StateMachine<'idle' | 'done'> {
      constructor() {
        super('idle');
      }

      @TransitionTo('done')
      run(): Promise<string> {
        return new Promise((resolve) => {
          resolveRun = resolve;
        });
      }
    }

    const job = new Job();
    const result = job.run();

    expect(job.state).toBe('idle');
    resolveRun?.('completed');
    await expect(result).resolves.toBe('completed');
    expect(job.state).toBe('done');
  });

  it('B1: @TransitionTo leaves the transition committed when an async method rejects', async () => {
    class Job extends StateMachine<'idle' | 'done'> {
      constructor() {
        super('idle');
      }

      @TransitionTo('done')
      async run(): Promise<void> {
        throw new Error('failed');
      }
    }

    const job = new Job();

    await expect(job.run()).rejects.toThrow('failed');
    expect(job.state).toBe('idle');
  });

  it('B4: @Timeout rejects without cancelling the underlying never-settling operation', async () => {
    vi.useFakeTimers();
    let ticks = 0;
    let underlyingTimer: ReturnType<typeof setInterval> | undefined;

    class Api {
      @Timeout(100)
      slow(): Promise<string> {
        return new Promise(() => {
          underlyingTimer = setInterval(() => {
            ticks++;
          }, 10);
        });
      }
    }

    try {
      const result = new Api().slow();
      const timeout = expect(result).rejects.toThrow(/100 ms$/);

      await vi.advanceTimersByTimeAsync(100);
      await timeout;
      const ticksAtTimeout = ticks;

      await vi.advanceTimersByTimeAsync(10);
      expect(ticks).toBeGreaterThan(ticksAtTimeout);
    } finally {
      if (underlyingTimer !== undefined) {
        clearInterval(underlyingTimer);
      }
    }
  });
});
