import { describe, expect, it, vi } from 'vitest';
import { PermitQueue } from '../../src/core/permit-queue';

describe('internal PermitQueue', () => {
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid permit count %s',
    (permits) => {
      expect(() => new PermitQueue(permits)).toThrow(RangeError);
    },
  );

  it.each([-1, NaN, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid queue limit %s',
    (maxQueue) => {
      expect(() => new PermitQueue(1, maxQueue)).toThrow(RangeError);
    },
  );
  it.each([1, 3])(
    'reserves %s permits synchronously and transfers in FIFO order',
    async (permits) => {
      const queue = new PermitQueue(permits);
      const holders = Array.from({ length: permits }, () => queue.acquire());
      expect(holders.every((release) => typeof release === 'function')).toBe(true);
      expect(queue.activeCount).toBe(permits);
      const second = queue.acquire();
      const third = queue.acquire();
      expect(second).toBeInstanceOf(Promise);
      expect(queue.queueLength).toBe(2);
      const release = holders[0];
      if (typeof release !== 'function') throw new Error('missing permit');
      release();
      expect(queue.activeCount).toBe(permits);
      expect(queue.queueLength).toBe(1);
      const newcomer = queue.acquire();
      expect(newcomer).toBeInstanceOf(Promise);
      const releaseSecond = await second;
      if (typeof releaseSecond !== 'function') throw new Error('missing second permit');
      releaseSecond();
      const releaseThird = await third;
      if (typeof releaseThird !== 'function') throw new Error('missing third permit');
      releaseThird();
      const releaseNewcomer = await newcomer;
      if (typeof releaseNewcomer !== 'function') throw new Error('missing newcomer permit');
      releaseNewcomer();
      for (const holder of holders) if (typeof holder === 'function') holder();
      expect(queue.isIdle).toBe(true);
      expect(queue.activeCount).toBe(0);
      expect(queue.queueLength).toBe(0);
    },
  );

  it.each([0, 1])('enforces maxQueue %s and idempotent release', async (maxQueue) => {
    const queue = new PermitQueue(1, maxQueue);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const waiting = maxQueue === 1 ? queue.acquire() : undefined;
    expect(queue.acquire()).toBeUndefined();
    release();
    release();
    expect(queue.activeCount).toBe(maxQueue);
    if (waiting !== undefined) {
      const releaseWaiting = await waiting;
      if (typeof releaseWaiting !== 'function') throw new Error('missing waiting permit');
      releaseWaiting();
      releaseWaiting();
    }
    expect(queue.isIdle).toBe(true);
  });

  it('rejects a pre-aborted caller before admitting it or invoking onQueued', async () => {
    const queue = new PermitQueue(1);
    const controller = new AbortController();
    const reason = { cancelled: true };
    controller.abort(reason);
    const onQueued = vi.fn();
    await expect(queue.acquire(controller.signal, onQueued)).rejects.toBe(reason);
    expect(onQueued).not.toHaveBeenCalled();
    expect(queue.isIdle).toBe(true);
  });

  it('removes an aborted waiter and detaches its listener, freeing maxQueue capacity', async () => {
    const queue = new PermitQueue(1, 1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = Symbol('cancelled');
    const waiting = queue.acquire(controller.signal);
    const assertion = expect(waiting).rejects.toBe(reason);
    expect(queue.queueLength).toBe(1);
    controller.abort(reason);
    await assertion;
    expect(queue.queueLength).toBe(0);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
    const replacement = queue.acquire();
    expect(replacement).toBeInstanceOf(Promise);
    release();
    const releaseReplacement = await replacement;
    if (typeof releaseReplacement !== 'function') throw new Error('missing replacement permit');
    releaseReplacement();
    expect(queue.isIdle).toBe(true);
  });

  it('detaches the waiter listener before resolving a direct transfer', async () => {
    const queue = new PermitQueue(1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const waiting = queue.acquire(controller.signal);
    release();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.activeCount).toBe(1);
    controller.abort('after-transfer');
    const releaseWaiting = await waiting;
    expect(typeof releaseWaiting).toBe('function');
    if (typeof releaseWaiting === 'function') releaseWaiting();
    expect(queue.isIdle).toBe(true);
  });

  it('installs the waiter and listener before onQueued can abort reentrantly', async () => {
    const queue = new PermitQueue(1, 1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const controller = new AbortController();
    const reason = new Error('during queued event');
    const waiting = queue.acquire(controller.signal, () => {
      expect(queue.queueLength).toBe(1);
      controller.abort(reason);
    });
    await expect(waiting).rejects.toBe(reason);
    expect(queue.queueLength).toBe(0);
    release();
    expect(queue.isIdle).toBe(true);
  });

  it('rechecks a signal that aborts synchronously while its listener is installed', async () => {
    const queue = new PermitQueue(1, 1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const controller = new AbortController();
    const reason = new Error('abort during listener installation');
    const originalAdd = controller.signal.addEventListener.bind(controller.signal);
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const add = vi.spyOn(controller.signal, 'addEventListener').mockImplementation((...args) => {
      originalAdd(...args);
      controller.abort(reason);
    });
    const onQueued = vi.fn();

    await expect(queue.acquire(controller.signal, onQueued)).rejects.toBe(reason);

    expect(onQueued).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1]);
    expect(queue.activeCount).toBe(1);
    expect(queue.queueLength).toBe(0);
    const replacement = queue.acquire();
    expect(replacement).toBeInstanceOf(Promise);
    release();
    const releaseReplacement = await replacement;
    if (typeof releaseReplacement !== 'function') throw new Error('missing replacement permit');
    releaseReplacement();
    expect(queue.isIdle).toBe(true);
  });

  it('skips a cancelled waiter even if an earlier abort listener stops propagation', async () => {
    const queue = new PermitQueue(1, 2);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const controller = new AbortController();
    controller.signal.addEventListener('abort', (event) => event.stopImmediatePropagation());
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = new Error('abort event intercepted');
    const cancelled = queue.acquire(controller.signal);
    const assertion = expect(cancelled).rejects.toBe(reason);
    const next = queue.acquire();

    controller.abort(reason);
    // The queue's abort listener was deliberately prevented from running.
    expect(queue.queueLength).toBe(2);
    release();

    await assertion;
    const releaseNext = await next;
    expect(typeof releaseNext).toBe('function');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.activeCount).toBe(1);
    expect(queue.queueLength).toBe(0);
    if (typeof releaseNext === 'function') releaseNext();
    expect(queue.isIdle).toBe(true);
  });

  it('keeps direct transfer fair when onQueued releases and adds another waiter', async () => {
    const queue = new PermitQueue(1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    let newcomer: ReturnType<PermitQueue['acquire']>;
    const waiting = queue.acquire(undefined, () => {
      release();
      newcomer = queue.acquire();
    });
    const releaseWaiting = await waiting;
    expect(queue.activeCount).toBe(1);
    expect(queue.queueLength).toBe(1);
    if (typeof releaseWaiting === 'function') releaseWaiting();
    const releaseNewcomer = await newcomer;
    if (typeof releaseNewcomer === 'function') releaseNewcomer();
    expect(queue.isIdle).toBe(true);
  });

  it('cleans up an onQueued callback that throws', async () => {
    const queue = new PermitQueue(1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const reason = new Error('queued callback');
    await expect(
      queue.acquire(undefined, () => {
        throw reason;
      }),
    ).rejects.toBe(reason);
    expect(queue.queueLength).toBe(0);
    release();
    expect(queue.isIdle).toBe(true);
  });

  it('preserves a grant already transferred by a callback that subsequently throws', async () => {
    const queue = new PermitQueue(1);
    const release = queue.acquire();
    if (typeof release !== 'function') throw new Error('missing permit');
    const granted = queue.acquire(undefined, () => {
      release();
      throw new Error('after transfer');
    });
    const releaseGranted = await granted;
    expect(typeof releaseGranted).toBe('function');
    expect(queue.activeCount).toBe(1);
    expect(queue.queueLength).toBe(0);
    if (typeof releaseGranted === 'function') releaseGranted();
    expect(queue.isIdle).toBe(true);
  });

  it('preserves invariants through a deterministic 100-call burst with cancellations and failures', async () => {
    const queue = new PermitQueue(3, 80);
    const controllers = Array.from({ length: 100 }, () => new AbortController());
    const starts: number[] = [];
    let peak = 0;
    const calls = controllers.map((controller, index) => {
      const acquired = queue.acquire(controller.signal);
      if (acquired === undefined) return Promise.resolve('full');
      return Promise.resolve(acquired)
        .then(async (release) => {
          try {
            if (controller.signal.aborted) throw controller.signal.reason;
            starts.push(index);
            peak = Math.max(peak, queue.activeCount);
            await Promise.resolve();
            if (index % 11 === 0) throw new Error('business');
            return 'ok';
          } finally {
            release();
          }
        })
        .catch(() => 'rejected');
    });
    controllers.forEach((controller, index) => {
      if (index >= 3 && index % 4 === 0) controller.abort(index);
    });
    await Promise.all(calls);
    expect(peak).toBeLessThanOrEqual(3);
    expect(starts.every((index) => !controllers[index]?.signal.aborted)).toBe(true);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(queue.queueLength).toBe(0);
    expect(queue.activeCount).toBe(0);
    expect(queue.isIdle).toBe(true);
  });
});
