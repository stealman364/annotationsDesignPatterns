import { describe, expect, it } from 'vitest';
import { StateMachine, TransitionTo, When } from '../../src/patterns/behavioral/state-machine';

describe('StateMachine async design-spike characterization', () => {
  it('retains completion-order transitions when two guards passed the same starting state', async () => {
    let firstDone!: () => void;
    let secondDone!: () => void;
    const firstBarrier = new Promise<void>((resolve) => {
      firstDone = resolve;
    });
    const secondBarrier = new Promise<void>((resolve) => {
      secondDone = resolve;
    });
    class Workflow extends StateMachine<'A' | 'B' | 'C'> {
      constructor() {
        super('A');
      }
      @When('A') @TransitionTo('B') first(): Promise<void> {
        return firstBarrier;
      }
      @When('A') @TransitionTo('C') second(): Promise<void> {
        return secondBarrier;
      }
    }
    const workflow = new Workflow();
    const first = workflow.first();
    const second = workflow.second();
    expect(workflow.state).toBe('A');
    secondDone();
    await second;
    expect(workflow.state).toBe('C');
    firstDone();
    await first;
    expect(workflow.state).toBe('B');
  });
});
