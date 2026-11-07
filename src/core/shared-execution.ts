import { PolicyError } from './errors';
import type { MaybePromise } from './types';

interface Consumer<Result> {
  detach(): void;
  resolve(value: Result | PromiseLike<Result>): void;
  reject(reason: unknown): void;
}

/** Internal opt-in execution owner. Lookup visibility and consumer interest are independent. */
export class SharedExecution<Result> {
  readonly #controller = new AbortController();
  readonly signal = this.#controller.signal;
  readonly promise: Promise<Result>;
  readonly #members = new Set<Consumer<Result>>();
  #hasUnsignalledConsumer = false;
  #resolve!: (value: Result | PromiseLike<Result>) => void;
  #reject!: (reason: unknown) => void;
  #state: 'accepting' | 'settled' | 'retired' = 'accepting';

  constructor(
    private readonly retire: () => void,
    private readonly complete?: (success: boolean, error?: unknown) => void,
  ) {
    this.promise = new Promise<Result>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    void this.promise.catch(() => undefined);
  }

  join(signal?: AbortSignal): Promise<Result> {
    if (signal?.aborted === true) return Promise.reject(signal.reason);
    if (this.#state !== 'accepting') return this.promise;
    if (signal === undefined) {
      this.#hasUnsignalledConsumer = true;
      return this.promise;
    }
    const waiting = new Promise<Result>((resolve, reject) => {
      const onAbort = (): void => {
        if (!this.#members.delete(member)) return;
        member.detach();
        reject(signal.reason);
        if (
          this.#members.size === 0 &&
          !this.#hasUnsignalledConsumer &&
          this.#state === 'accepting'
        ) {
          this.#state = 'retired';
          this.retire();
          const reason = new PolicyError('Shared execution has no remaining consumers', {
            code: 'ABORTED',
          });
          this.#reject(reason);
          this.#controller.abort(reason);
        }
      };
      const member: Consumer<Result> = {
        detach: () => signal.removeEventListener('abort', onAbort),
        resolve,
        reject,
      };
      this.#members.add(member);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    // A synchronous initiator may return its value rather than this reservation.
    void waiting.catch(() => undefined);
    return waiting;
  }

  start(invoke: () => MaybePromise<Result>): MaybePromise<Result> {
    if (this.#state === 'retired') return this.promise;
    try {
      const value = invoke();
      let then: unknown;
      try {
        if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
          then = (value as PromiseLike<Result>).then;
        }
      } catch (error) {
        this.#settle(false, error);
        return this.promise;
      }
      if (typeof then === 'function') {
        const adopted = new Promise<Result>((resolve, reject) => {
          queueMicrotask(() => {
            try {
              Reflect.apply(then, value, [resolve, reject]);
            } catch (error) {
              reject(error);
            }
          });
        });
        void adopted.then(
          (result) => this.#settle(true, result),
          (error: unknown) => this.#settle(false, error),
        );
        return this.promise;
      }
      this.#settle(true, value);
      return value;
    } catch (error) {
      this.#settle(false, error);
      throw error;
    }
  }

  #settle(success: boolean, value: unknown): void {
    if (this.#state !== 'accepting') return;
    this.#state = 'settled';
    for (const member of this.#members) {
      member.detach();
      if (success) member.resolve(value as Result);
      else member.reject(value);
    }
    this.#members.clear();
    this.#hasUnsignalledConsumer = false;
    this.complete?.(success, success ? undefined : value);
    if (success) this.#resolve(value as Result);
    else this.#reject(value);
  }
}
