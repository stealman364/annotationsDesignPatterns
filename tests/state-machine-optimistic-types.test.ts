import { describe, expectTypeOf, it } from 'vitest';
import { StateMachine, TransitionTo } from '../src/patterns/behavioral/state-machine';

type State = 'idle' | 'done';

class OptimisticMachine extends StateMachine<State> {
  @TransitionTo('done', { concurrency: 'reject-stale' })
  finish(): string {
    return 'ok';
  }

  @TransitionTo('done')
  legacy(): Promise<number> {
    return Promise.resolve(1);
  }
}

function verifyInvalidTypesAreRejected(): void {
  class InvalidMachine extends StateMachine<State> {
    // @ts-expect-error Unsupported concurrency modes are rejected.
    @TransitionTo('done', { concurrency: 'merge' })
    unsupportedMode(): void {}

    // @ts-expect-error Optimistic transitions must retain closed state unions.
    @TransitionTo('missing', { concurrency: 'reject-stale' })
    invalidDestination(): void {}
  }
  void InvalidMachine;
}

const machine = new OptimisticMachine('idle');
void verifyInvalidTypesAreRejected;

describe('optimistic StateMachine decorator types', () => {
  it('preserves decorated method signatures', () => {
    expectTypeOf(machine.finish).toEqualTypeOf<() => string>();
    expectTypeOf(machine.legacy).toEqualTypeOf<() => Promise<number>>();
  });
});
