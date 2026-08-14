import { describe, expect, it } from 'vitest';
import { StateMachine, TransitionTo } from '../src/patterns/behavioral/state-machine';

type JobState = 'idle' | 'done';

describe('@TransitionTo with asynchronous results', () => {
  it('keeps state unchanged while a Promise is pending', async () => {
    let resolveRun: ((value: string) => void) | undefined;

    class Job extends StateMachine<JobState> {
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
  });

  it('commits the transition after a Promise resolves', async () => {
    class Job extends StateMachine<JobState> {
      constructor() {
        super('idle');
      }

      @TransitionTo('done')
      async run(): Promise<string> {
        return 'completed';
      }
    }

    const job = new Job();

    await expect(job.run()).resolves.toBe('completed');
    expect(job.state).toBe('done');
  });

  it('does not transition and preserves the identity of a rejection', async () => {
    const reason = new Error('failed');

    class Job extends StateMachine<JobState> {
      constructor() {
        super('idle');
      }

      @TransitionTo('done')
      async run(): Promise<never> {
        throw reason;
      }
    }

    const job = new Job();

    await expect(job.run()).rejects.toBe(reason);
    expect(job.state).toBe('idle');
  });

  it('waits for a callable thenable before committing the transition', async () => {
    let resolveRun: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      resolveRun = resolve;
    });
    const result = Object.assign(() => undefined, {
      then: pending.then.bind(pending),
    }) as (() => void) & PromiseLike<string>;

    class Job extends StateMachine<JobState> {
      constructor() {
        super('idle');
      }

      @TransitionTo('done')
      run(): (() => void) & PromiseLike<string> {
        return result;
      }
    }

    const job = new Job();
    const returned = job.run();

    expect(job.state).toBe('idle');
    resolveRun?.('completed');
    await expect(Promise.resolve(returned)).resolves.toBe('completed');
    expect(job.state).toBe('done');
  });
});
