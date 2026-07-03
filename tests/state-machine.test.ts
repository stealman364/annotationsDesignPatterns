import { describe, expect, it } from 'vitest';
import { StateMachine, TransitionTo, When } from '../src/patterns/behavioral/state-machine';

type DocState = 'draft' | 'review' | 'published';

class Doc extends StateMachine<DocState> {
  constructor() {
    super('draft');
  }

  @When('draft')
  @TransitionTo('review')
  submit(): string {
    return 'enviado';
  }

  @When('review')
  @TransitionTo('published')
  approve(): void {}

  @When('review')
  @TransitionTo('draft')
  reject(): void {}
}

describe('StateMachine + @When + @TransitionTo', () => {
  it('transiciona al estado indicado tras ejecutar el método', () => {
    const doc = new Doc();
    expect(doc.state).toBe('draft');
    expect(doc.submit()).toBe('enviado');
    expect(doc.state).toBe('review');
    doc.approve();
    expect(doc.state).toBe('published');
  });

  it('lanza si el método se llama en un estado no permitido', () => {
    const doc = new Doc();
    doc.submit();
    expect(() => doc.submit()).toThrow(
      'El método submit no puede llamarse en el estado "review" (permitidos: draft)'
    );
  });

  it('reject devuelve el documento a draft', () => {
    const doc = new Doc();
    doc.submit();
    doc.reject();
    expect(doc.state).toBe('draft');
    doc.submit();
    expect(doc.state).toBe('review');
  });

  it('@When acepta varios estados permitidos', () => {
    class Player extends StateMachine<'stopped' | 'playing' | 'paused'> {
      constructor() {
        super('stopped');
      }

      @When('stopped', 'paused')
      @TransitionTo('playing')
      play(): void {}
    }

    const p = new Player();
    p.play();
    expect(p.state).toBe('playing');
    expect(() => p.play()).toThrow('no puede llamarse en el estado "playing"');
  });

  it('no transiciona si el método lanza', () => {
    class Job extends StateMachine<'idle' | 'done'> {
      constructor() {
        super('idle');
      }

      @When('idle')
      @TransitionTo('done')
      run(): void {
        throw new Error('boom');
      }
    }

    const j = new Job();
    expect(() => j.run()).toThrow('boom');
    expect(j.state).toBe('idle');
  });
});
