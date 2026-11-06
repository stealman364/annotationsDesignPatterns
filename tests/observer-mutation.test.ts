import { describe, expect, it } from 'vitest';
import { Subject } from '../src/patterns/behavioral/observer';

describe('Subject listener mutation', () => {
  it('defers listeners added during emit until the following event', () => {
    const subject = new Subject<{ event: number }>();
    const received: string[] = [];
    const added = (value: number): void => {
      received.push(`added:${value}`);
    };
    subject.on('event', (value) => {
      received.push(`first:${value}`);
      subject.on('event', added);
    });
    subject.emit('event', 1);
    expect(received).toEqual(['first:1']);
    subject.emit('event', 2);
    expect(received).toEqual(['first:1', 'first:2', 'added:2']);
  });

  it('delivers to a listener removed during emit, then omits it from the following event', () => {
    const subject = new Subject<{ event: number }>();
    const received: string[] = [];
    let unsubscribe = (): void => {};
    subject.on('event', (value) => {
      received.push(`first:${value}`);
      unsubscribe();
    });
    unsubscribe = subject.on('event', (value) => {
      received.push(`second:${value}`);
    });
    subject.on('event', (value) => {
      received.push(`third:${value}`);
    });
    subject.emit('event', 1);
    subject.emit('event', 2);
    expect(received).toEqual(['first:1', 'second:1', 'third:1', 'first:2', 'third:2']);
  });

  it('calls a self-removing and re-added listener only once per emission', () => {
    const subject = new Subject<{ event: number }>();
    const received: number[] = [];
    let unsubscribe = (): void => {};
    const listener = (value: number): void => {
      received.push(value);
      // Bound an accidental Set-iteration loop so a regression fails rather
      // than hanging the runner.
      if (received.length > 5) throw new Error('unbounded listener iteration');
      unsubscribe();
      unsubscribe = subject.on('event', listener);
    };
    unsubscribe = subject.on('event', listener);
    subject.emit('event', 1);
    subject.emit('event', 2);
    expect(received).toEqual([1, 2]);
  });

  it('keeps each reentrant emission snapshot independent', () => {
    const subject = new Subject<{ event: number }>();
    const received: string[] = [];
    subject.on('event', (value) => {
      received.push(`first:${value}`);
      if (value === 1) {
        subject.on('event', (nested) => {
          received.push(`added:${nested}`);
        });
        subject.emit('event', 2);
      }
    });
    subject.on('event', (value) => {
      received.push(`second:${value}`);
    });
    subject.emit('event', 1);
    expect(received).toEqual(['first:1', 'first:2', 'second:2', 'added:2', 'second:1']);
  });

  it('preserves the starting order when a later listener is removed and re-added', () => {
    const subject = new Subject<{ event: number }>();
    const received: string[] = [];
    const last = (value: number): void => {
      received.push(`last:${value}`);
    };
    let unsubscribe = (): void => {};
    subject.on('event', (value) => {
      received.push(`first:${value}`);
      unsubscribe();
      unsubscribe = subject.on('event', last);
    });
    unsubscribe = subject.on('event', last);
    subject.on('event', (value) => {
      received.push(`middle:${value}`);
    });
    subject.emit('event', 1);
    subject.emit('event', 2);
    expect(received).toEqual(['first:1', 'last:1', 'middle:1', 'first:2', 'middle:2', 'last:2']);
  });
});
