import { describe, expect, it, vi } from 'vitest';
import {
  isStateTransitionConflictError,
  StateMachine,
  StateTransitionConflictError,
  TransitionTo,
  When,
} from '../src/patterns/behavioral/state-machine';

const optimistic = { concurrency: 'reject-stale' } as const;

it('rejects an invalid When target before invocation', () => {
  expect(() => When('A')(() => undefined, { kind: 'getter' } as never)).toThrow(TypeError);
});

it.each([null, { then: 1 }, () => 'value'])(
  'keeps optimistic non-thenables synchronous: %s',
  (value) => {
    class Machine extends StateMachine<'A' | 'B'> {
      @TransitionTo('B', optimistic)
      finish() {
        return value;
      }
    }
    const machine = new Machine('A');
    expect(machine.finish()).toBe(value);
    expect(machine.state).toBe('B');
  },
);

it('rejects a thenable invocation without committing optimistic state', async () => {
  const failure = new Error('then invocation');
  class Machine extends StateMachine<'A' | 'B'> {
    @TransitionTo('B', optimistic)
    finish() {
      return {
        then() {
          throw failure;
        },
      };
    }
  }
  const machine = new Machine('A');
  await expect(machine.finish()).rejects.toBe(failure);
  expect(machine.state).toBe('A');
});

it('preserves legacy rejection for an inaccessible then accessor', async () => {
  const failure = new Error('then accessor');
  class Machine extends StateMachine<'A' | 'B'> {
    @TransitionTo('B')
    finish() {
      return Object.defineProperty({}, 'then', {
        get() {
          throw failure;
        },
      });
    }
  }
  const machine = new Machine('A');
  await expect(machine.finish()).rejects.toBe(failure);
  expect(machine.state).toBe('A');
});

it('reads an optimistic then accessor only once and preserves its failure', async () => {
  const failure = new Error('accessor');
  let reads = 0;
  class Machine extends StateMachine<'A' | 'B'> {
    @TransitionTo('B', optimistic)
    finish(): object {
      return Object.defineProperty({}, 'then', {
        get() {
          reads += 1;
          if (reads === 1) throw failure;
          return (resolve: (value: string) => void) => resolve('wrong');
        },
      });
    }
  }
  const machine = new Machine('A');
  await expect(machine.finish()).rejects.toBe(failure);
  expect(reads).toBe(1);
  expect(machine.state).toBe('A');
});

it('supports an optimistic decorator from an independently loaded module copy', async () => {
  vi.resetModules();
  const foreign = await import('../src/patterns/behavioral/state-machine');
  class Mixed extends StateMachine<'A' | 'B'> {
    @foreign.TransitionTo('B', optimistic)
    finish(): string {
      return 'ok';
    }
  }
  const machine = new Mixed('A');
  expect(machine.finish()).toBe('ok');
  expect(machine.state).toBe('B');
});

it('rejects forged receivers, hostile error brands and invalid decorator targets', () => {
  expect(isStateTransitionConflictError(null)).toBe(false);
  expect(isStateTransitionConflictError(() => undefined)).toBe(false);
  expect(
    isStateTransitionConflictError(
      new Proxy(
        {},
        {
          get() {
            throw new Error('trap');
          },
        },
      ),
    ),
  ).toBe(false);
  const decorate = TransitionTo('B', optimistic);
  const method = decorate(
    function (this: StateMachine<'A' | 'B'>) {
      return 'ok';
    },
    { kind: 'method' } as ClassMethodDecoratorContext<
      StateMachine<'A' | 'B'>,
      (this: StateMachine<'A' | 'B'>) => string
    >,
  );
  expect(() => method.call({} as StateMachine<'A' | 'B'>)).toThrow(TypeError);
  expect(() => decorate(() => 'ok', { kind: 'getter' } as never)).toThrow(TypeError);
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('StateMachine reject-stale transitions', () => {
  it('lets the first valid completion commit and rejects a later completion', async () => {
    const earlier = deferred<string>();
    const later = deferred<string>();

    class Workflow extends StateMachine<'idle' | 'first' | 'second'> {
      @TransitionTo('first', optimistic)
      first(): Promise<string> {
        return earlier.promise;
      }

      @TransitionTo('second', optimistic)
      second(): Promise<string> {
        return later.promise;
      }
    }

    const workflow = new Workflow('idle');
    const first = workflow.first();
    const second = workflow.second();

    expect(workflow.state).toBe('idle');
    earlier.resolve('first result');
    await expect(first).resolves.toBe('first result');
    later.resolve('second result');
    await expect(second).rejects.toMatchObject({ name: 'StateTransitionConflictError' });
    expect(workflow.state).toBe('first');
  });

  it('treats a same-state manual transition as a revision change', async () => {
    const operation = deferred<void>();

    class Workflow extends StateMachine<'idle' | 'done'> {
      @TransitionTo('done', optimistic)
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.finish();
    workflow.transitionTo('idle');
    operation.resolve();

    await expect(pending).rejects.toBeInstanceOf(StateTransitionConflictError);
    expect(workflow.state).toBe('idle');
  });

  it('detects ABA state changes by revision identity', async () => {
    const operation = deferred<void>();

    class Workflow extends StateMachine<'A' | 'B' | 'C'> {
      @TransitionTo('C', optimistic)
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('A');
    const pending = workflow.finish();
    workflow.transitionTo('B');
    workflow.transitionTo('A');
    operation.resolve();

    await expect(pending).rejects.toBeInstanceOf(StateTransitionConflictError);
    expect(workflow.state).toBe('A');
  });

  it('rejects an outer operation after a nested manual transition', async () => {
    const operation = deferred<void>();

    class Workflow extends StateMachine<'idle' | 'nested' | 'outer'> {
      @TransitionTo('outer', optimistic)
      outer(): Promise<void> {
        this.transitionTo('nested');
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.outer();
    operation.resolve();

    await expect(pending).rejects.toBeInstanceOf(StateTransitionConflictError);
    expect(workflow.state).toBe('nested');
  });

  it('preserves the original business failure when the operation also became stale', async () => {
    const operation = deferred<void>();
    const failure = new Error('business failure');

    class Workflow extends StateMachine<'idle' | 'changed' | 'done'> {
      @TransitionTo('done', optimistic)
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.finish();
    workflow.transitionTo('changed');
    operation.reject(failure);

    await expect(pending).rejects.toBe(failure);
    expect(workflow.state).toBe('changed');
  });

  it('keeps sync results and throws synchronous business errors unchanged', () => {
    const failure = new Error('sync failure');

    class Workflow extends StateMachine<'idle' | 'done'> {
      @TransitionTo('done', optimistic)
      finish(): string {
        return 'ok';
      }

      @TransitionTo('done', optimistic)
      fail(): never {
        throw failure;
      }
    }

    const workflow = new Workflow('idle');
    expect(workflow.finish()).toBe('ok');
    expect(workflow.state).toBe('done');
    workflow.transitionTo('idle');
    expect(() => workflow.fail()).toThrow(failure);
    expect(workflow.state).toBe('idle');
  });

  it('commits through an internal closure without dispatching an override', async () => {
    let manualOverrideCalls = 0;
    const operation = deferred<void>();

    class Workflow extends StateMachine<'idle' | 'done'> {
      override transitionTo(next: 'idle' | 'done'): void {
        manualOverrideCalls += 1;
        if (next === 'done') this.transitionTo('idle');
        super.transitionTo(next);
      }

      @TransitionTo('done', optimistic)
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.finish();
    operation.resolve();
    await expect(pending).resolves.toBeUndefined();

    expect(workflow.state).toBe('done');
    expect(manualOverrideCalls).toBe(0);
  });

  it('uses virtual transition dispatch for legacy decorators', async () => {
    let overrideCalls = 0;
    const operation = deferred<void>();

    class Workflow extends StateMachine<'idle' | 'done'> {
      override transitionTo(next: 'idle' | 'done'): void {
        overrideCalls += 1;
        super.transitionTo(next);
      }

      @TransitionTo('done')
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.finish();
    operation.resolve();
    await expect(pending).resolves.toBeUndefined();

    expect(workflow.state).toBe('done');
    expect(overrideCalls).toBe(1);
  });

  it('observes manual transitions through a delegating inherited override', async () => {
    const operation = deferred<void>();
    let overrideCalls = 0;

    class BaseWorkflow extends StateMachine<'idle' | 'changed' | 'done'> {
      override transitionTo(next: 'idle' | 'changed' | 'done'): void {
        overrideCalls += 1;
        super.transitionTo(next);
      }
    }

    class Workflow extends BaseWorkflow {
      @TransitionTo('done', optimistic)
      finish(): Promise<void> {
        return operation.promise;
      }
    }

    const workflow = new Workflow('idle');
    const pending = workflow.finish();
    workflow.transitionTo('changed');
    operation.resolve();

    await expect(pending).rejects.toBeInstanceOf(StateTransitionConflictError);
    expect(workflow.state).toBe('changed');
    expect(overrideCalls).toBe(1);
  });

  it('recognizes conflict errors using the global brand', () => {
    const error = new StateTransitionConflictError();
    const duplicateCopyError = new Error('from another package copy');
    Object.defineProperty(
      duplicateCopyError,
      Symbol.for('annotations-design-patterns.StateTransitionConflictError'),
      {
        value: true,
      },
    );

    expect(isStateTransitionConflictError(error)).toBe(true);
    expect(isStateTransitionConflictError(duplicateCopyError)).toBe(true);
    expect(isStateTransitionConflictError(new Error())).toBe(false);
  });

  it('rejects an unsupported concurrency option before invoking the method', () => {
    expect(() => TransitionTo('done', { concurrency: 'merge' } as never)).toThrow(TypeError);
  });
});
