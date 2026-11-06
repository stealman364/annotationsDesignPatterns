import { describe, expect, expectTypeOf, it } from 'vitest';
import { StateMachine, TransitionTo, When } from '../src/patterns/behavioral/state-machine';

type State = 'draft' | 'review' | 'published';

class Article extends StateMachine<State> {
  constructor() {
    super('draft');
  }

  @When('draft', 'review')
  @TransitionTo('published')
  publish(id: number): string {
    return `published:${id}`;
  }

  @When('published')
  @TransitionTo('draft')
  async reset(): Promise<number> {
    return 1;
  }

  // @ts-expect-error Unknown guard state must be rejected for a closed state union.
  @When('publised')
  invalidGuard(): void {}

  // @ts-expect-error Every supplied guard state must belong to the state union.
  @When('draft', 'publised')
  invalidMixedGuard(): void {}

  // @ts-expect-error Unknown destination must be rejected for a closed state union.
  @TransitionTo('publised')
  invalidTransition(): void {}

  // @ts-expect-error An explicitly broad method receiver cannot widen the class state union.
  @When('publised')
  invalidBroadReceiverGuard(this: StateMachine<string>): void {}

  // @ts-expect-error An explicitly broad method receiver cannot permit an invalid destination.
  @TransitionTo('publised')
  invalidBroadReceiverTransition(this: StateMachine<string>): void {}
}

class InheritedArticle extends Article {
  @When('published')
  @TransitionTo('review')
  revise(): void {}

  // @ts-expect-error Inheritance must not widen the declared state union.
  @TransitionTo('publised')
  invalidInheritedTransition(): void {}

  // @ts-expect-error Inherited guards must retain the closed state union too.
  @When('publised')
  invalidInheritedGuard(): void {}
}

class OpenMachine extends StateMachine<string> {
  constructor() {
    super('anything');
  }

  @When('anything', 'any other string')
  @TransitionTo('dynamic destination')
  act(): string {
    return 'ok';
  }
}

class DefaultMachine extends StateMachine {
  constructor() {
    super('start');
  }

  @When('start')
  @TransitionTo('other')
  act(): void {}
}

const editableStates: readonly State[] = ['draft', 'review'];
const draftGuard = When('draft');
const publishTransition = TransitionTo('published');

class ReusedDecorators extends StateMachine<State> {
  constructor() {
    super('draft');
  }

  @draftGuard
  @publishTransition
  act(this: StateMachine<string>): string {
    return 'ok';
  }

  @When(...editableStates)
  editable(): void {}
}

describe('state decorator type contracts', () => {
  it('preserves closed-union methods, arguments and sync/async results', async () => {
    const article = new Article();
    expectTypeOf(article.state).toEqualTypeOf<State>();
    expectTypeOf(article.publish).toEqualTypeOf<(id: number) => string>();
    expectTypeOf(article.reset).toEqualTypeOf<() => Promise<number>>();
    expect(article.publish(3)).toBe('published:3');
    await expect(article.reset()).resolves.toBe(1);
    expect(article.state).toBe('draft');
  });

  it('preserves inherited closed state and the generic string escape hatch', () => {
    const inherited = new InheritedArticle();
    inherited.publish(1);
    inherited.revise();
    expect(inherited.state).toBe('review');
    const open = new OpenMachine();
    expect(open.act()).toBe('ok');
    expect(open.state).toBe('dynamic destination');
    const generic = new DefaultMachine();
    generic.act();
    expect(generic.state).toBe('other');
  });

  it('preserves reusable decorator factories, union-typed state arrays and broad valid method receivers', () => {
    const machine = new ReusedDecorators();
    machine.editable();
    expect(machine.act()).toBe('ok');
    expect(machine.state).toBe('published');
  });
});
