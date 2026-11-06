import { describe, expect, it, vi } from 'vitest';
import { createOperationContext } from '../../src/core/context';
import { invokeWithContext } from '../../src/core/invocation';
import { overlap } from '../../src/operators/overlap';
import { pipe } from '../../src/public/pipe';
import { run } from '../../src/public/run';

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('overlap queue cancellation and fairness', () => {
  it('releases after synchronous throws from active and queued work', async () => {
    const active = deferred();
    const failure = new Error('synchronous failure');
    const operation = pipe(
      (id: string): string | Promise<string> => {
        if (id === 'fail') throw failure;
        return id === 'active' ? active.promise : id;
      },
      overlap<object, readonly [string], string>({ mode: 'queue', key: () => 'key' }),
    );
    expect(() => operation.call({}, 'fail')).toThrow(failure);
    const first = operation.call({}, 'active');
    const queued = operation.call({}, 'fail');
    const assertion = expect(queued).rejects.toBe(failure);
    const last = operation.call({}, 'last');
    active.resolve('active');
    await first;
    await assertion;
    await expect(last).resolves.toBe('last');
    expect(operation.call({}, 'after')).toBe('after');
  });

  it('skips newly admitted work cancelled by its started observer and releases capacity', async () => {
    const controller = new AbortController();
    const reason = new Error('observer cancellation');
    const body = vi.fn(() => 'ok');
    const operation = pipe(
      body,
      overlap<object, readonly [], string>({ mode: 'queue', key: () => 'key' }),
    );
    await expect(
      run({}, [], operation, {
        signal: controller.signal,
        eventSink: {
          emit(event) {
            if (event.kind === 'overlap.started') controller.abort(reason);
          },
        },
      }),
    ).rejects.toBe(reason);
    expect(body).not.toHaveBeenCalled();
    expect(operation.call({})).toBe('ok');
  });

  it.each(['drop', 'share'] as const)(
    'rejects %s preabort at the operator boundary',
    async (mode) => {
      const controller = new AbortController();
      const reason = new Error('preabort');
      controller.abort(reason);
      const body = vi.fn(() => 'unexpected');
      const operation = pipe(
        body,
        overlap<object, readonly [], string>({ mode, key: () => 'key' }),
      );
      await expect(
        invokeWithContext(
          {},
          [],
          operation,
          createOperationContext({}, [], { signal: controller.signal }),
        ),
      ).rejects.toBe(reason);
      expect(body).not.toHaveBeenCalled();
    },
  );

  it('rejects preabort at the operator boundary before executing', async () => {
    const controller = new AbortController();
    const reason = new Error('preabort');
    controller.abort(reason);
    const body = vi.fn(() => 'unexpected');
    const operation = pipe(
      body,
      overlap<object, readonly [], string>({ mode: 'queue', key: () => 'key' }),
    );
    await expect(
      invokeWithContext(
        {},
        [],
        operation,
        createOperationContext({}, [], { signal: controller.signal }),
      ),
    ).rejects.toBe(reason);
    expect(body).not.toHaveBeenCalled();
  });

  it('removes a queued abort, frees maxQueue and never executes it', async () => {
    const active = deferred();
    const controller = new AbortController();
    const reason = new Error('withdraw');
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      overlap<object, readonly [string], string>({ mode: 'queue', key: () => 'key', maxQueue: 1 }),
    );
    const first = run({}, ['first'], operation, {});
    const second = run({}, ['cancelled'], operation, { signal: controller.signal });
    const assertion = expect(second).rejects.toBe(reason);
    controller.abort(reason);
    await assertion;
    const third = run({}, ['third'], operation, {});
    active.resolve('first');
    await expect(first).resolves.toBe('first');
    await expect(third).resolves.toBe('third');
    expect(starts).toEqual(['first', 'third']);
    expect(operation.call({}, 'after')).toBe('after');
  });

  it('checks abort again between grant and execution and transfers the permit onward', async () => {
    const active = deferred();
    const controller = new AbortController();
    const reason = new Error('abort during handoff');
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      overlap<object, readonly [string], string>({ mode: 'queue', key: () => 'key' }),
    );
    const first = run({}, ['first'], operation, {});
    const second = run({}, ['cancelled'], operation, { signal: controller.signal });
    const assertion = expect(second).rejects.toBe(reason);
    const third = run({}, ['third'], operation, {});
    void active.promise.then(() => controller.abort(reason));
    active.resolve('first');
    await first;
    await assertion;
    await expect(third).resolves.toBe('third');
    expect(starts).toEqual(['first', 'third']);
  });

  it('keeps the active permit until noncooperative work actually settles', async () => {
    const active = deferred();
    const controller = new AbortController();
    const reason = new Error('stop waiting');
    const starts: string[] = [];
    const operation = pipe(
      (id: string) => {
        starts.push(id);
        return id === 'first' ? active.promise : id;
      },
      overlap<object, readonly [string], string>({ mode: 'queue', key: () => 'key' }),
    );
    const first = run({}, ['first'], operation, { signal: controller.signal });
    const assertion = expect(first).rejects.toBe(reason);
    const second = run({}, ['second'], operation, {});
    controller.abort(reason);
    await assertion;
    expect(starts).toEqual(['first']);
    active.resolve('late');
    await expect(second).resolves.toBe('second');
    expect(starts).toEqual(['first', 'second']);
  });

  it('survives 100 deterministic cancellations, failures and releases in FIFO order', async () => {
    const active = deferred();
    const starts: number[] = [];
    let concurrent = 0;
    let peak = 0;
    const controllers = Array.from({ length: 100 }, () => new AbortController());
    const operation = pipe(
      async (id: number) => {
        starts.push(id);
        concurrent++;
        peak = Math.max(peak, concurrent);
        try {
          if (id === -1) await active.promise;
          else await Promise.resolve();
          if (id >= 0 && id % 7 === 0) throw new Error('business');
          return id;
        } finally {
          concurrent--;
        }
      },
      overlap<object, readonly [number], number>({
        mode: 'queue',
        key: () => 'key',
        maxQueue: 100,
      }),
    );
    const first = operation.call({}, -1);
    const calls = controllers.map((controller, id) =>
      run({}, [id], operation, { signal: controller.signal }),
    );
    const settled = Promise.allSettled(calls);
    controllers.forEach((controller, id) => {
      if ((id * 17) % 5 < 2) controller.abort(id);
    });
    active.resolve('release');
    await first;
    await settled;
    expect(starts).toEqual([
      -1,
      ...controllers.flatMap((controller, id) => (controller.signal.aborted ? [] : [id])),
    ]);
    expect(peak).toBe(1);
    expect(concurrent).toBe(0);
    await expect(operation.call({}, 101)).resolves.toBe(101);
  });
});
