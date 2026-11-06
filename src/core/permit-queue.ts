import { isCount } from './numeric';

/** Internal permit ownership. Calling release twice has no further effect. */
export type Release = () => void;

interface Waiter {
  readonly signal: AbortSignal | undefined;
  readonly resolve: (release: Release) => void;
  readonly reject: (reason: unknown) => void;
  detach(): void;
  waiting: boolean;
}

/** Small FIFO admission primitive; ownership transfers without a vacant slot. */
export class PermitQueue {
  readonly #permits: number;
  readonly #maxQueue: number;
  readonly #waiting: Waiter[] = [];
  #active = 0;

  constructor(permits: number, maxQueue = Infinity) {
    if (!isCount(permits, 1) || (maxQueue !== Infinity && !isCount(maxQueue, 0))) {
      throw new RangeError(
        'PermitQueue requires positive safe permits and a non-negative queue limit',
      );
    }
    this.#permits = permits;
    this.#maxQueue = maxQueue;
  }

  get activeCount(): number {
    return this.#active;
  }

  get queueLength(): number {
    return this.#waiting.length;
  }

  get isIdle(): boolean {
    return this.#active === 0 && this.#waiting.length === 0;
  }

  acquire(signal?: AbortSignal, onQueued?: () => void): Release | Promise<Release> | undefined {
    if (signal?.aborted === true) return Promise.reject(signal.reason);
    if (this.#active < this.#permits) {
      this.#active++;
      return this.#release();
    }
    if (this.#waiting.length >= this.#maxQueue) return undefined;

    return new Promise<Release>((resolve, reject) => {
      const withdraw = (reason: unknown): void => {
        if (!waiter.waiting) return;
        waiter.waiting = false;
        const index = this.#waiting.indexOf(waiter);
        if (index !== -1) this.#waiting.splice(index, 1);
        waiter.detach();
        reject(reason);
      };
      const onAbort = (): void => withdraw(signal?.reason);
      const waiter: Waiter = {
        signal,
        resolve,
        reject,
        waiting: true,
        detach(): void {
          signal?.removeEventListener('abort', onAbort);
        },
      };
      this.#waiting.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted === true) {
        withdraw(signal.reason);
        return;
      }
      try {
        onQueued?.();
      } catch (error) {
        // If a reentrant callback already transferred ownership, its resolved
        // grant must remain usable. Otherwise remove the abandoned waiter.
        withdraw(error);
      }
    });
  }

  #release(): Release {
    let released = false;
    return (): void => {
      if (released) return;
      released = true;
      while (true) {
        const waiter = this.#waiting.shift();
        if (waiter === undefined) {
          this.#active--;
          return;
        }
        waiter.waiting = false;
        waiter.detach();
        if (waiter.signal?.aborted === true) {
          waiter.reject(waiter.signal.reason);
          continue;
        }
        // Keep #active unchanged: this permit belongs to the next waiter
        // before its continuation runs, preventing a newcomer from barging.
        waiter.resolve(this.#release());
        return;
      }
    };
  }
}
