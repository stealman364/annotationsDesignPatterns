import type { AsyncStore, StoreCapabilities, StoreEntryOptions } from '../core/store';

export type RemoteStoreOperation = 'get' | 'has' | 'set' | 'delete' | 'clear';
export type RemoteStoreErrorCode = 'REMOTE_STORE_NETWORK' | 'REMOTE_STORE_TIMEOUT';

/**
 * Provider-neutral transport contract for an async remote store. A transport
 * must declare its actual capabilities; this wrapper never upgrades them.
 */
export interface RemoteStoreTransport<K, V> extends AsyncStore<K, V> {
  readonly capabilities: StoreCapabilities;
}

export interface RemoteAsyncStoreOptions {
  /** Optional per-call deadline for the transport, in milliseconds. */
  readonly timeoutMs?: number;
}

/** A failure raised while communicating with the remote store, not by user work. */
export class RemoteStoreError extends Error {
  readonly code: RemoteStoreErrorCode;
  readonly operation: RemoteStoreOperation;
  override readonly cause: unknown;

  constructor(code: RemoteStoreErrorCode, operation: RemoteStoreOperation, cause?: unknown) {
    const detail = code === 'REMOTE_STORE_TIMEOUT' ? 'timed out' : 'failed';
    super(`Remote store ${operation} ${detail}`, { cause });
    this.name = 'RemoteStoreError';
    this.code = code;
    this.operation = operation;
    this.cause = cause;
  }
}

function validateOptions(options: RemoteAsyncStoreOptions): number | undefined {
  if (options.timeoutMs === undefined) {
    return undefined;
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0) {
    throw new RangeError('RemoteAsyncStore timeoutMs must be a finite, non-negative number');
  }
  return options.timeoutMs;
}

function exposeCrudCapabilities(capabilities: StoreCapabilities): StoreCapabilities {
  return Object.freeze({
    atomic: false,
    circuitBreaker: false,
    consistency: capabilities.consistency,
    isolation: capabilities.isolation,
    locks: false,
    network: capabilities.network,
    ttl: capabilities.ttl,
  });
}

/**
 * Decorates a provider supplied remote transport with a bounded deadline and
 * typed transport failures. It intentionally implements only AsyncStore:
 * atomicity remains an explicit capability owned by a provider-specific
 * adapter, never inferred from independent get/set calls.
 */
export class RemoteAsyncStore<K, V> implements AsyncStore<K, V> {
  readonly capabilities: StoreCapabilities;

  readonly #timeoutMs: number | undefined;

  constructor(
    private readonly transport: RemoteStoreTransport<K, V>,
    options: RemoteAsyncStoreOptions = {},
  ) {
    this.capabilities = exposeCrudCapabilities(transport.capabilities);
    this.#timeoutMs = validateOptions(options);
  }

  get(key: K): Promise<V | undefined> {
    return this.#execute('get', () => this.transport.get(key));
  }

  has(key: K): Promise<boolean> {
    return this.#execute('has', () => this.transport.has(key));
  }

  set(key: K, value: V, options?: StoreEntryOptions): Promise<void> {
    return this.#execute('set', () => this.transport.set(key, value, options));
  }

  delete(key: K): Promise<boolean> {
    return this.#execute('delete', () => this.transport.delete(key));
  }

  clear(): Promise<void> {
    return this.#execute('clear', () => this.transport.clear());
  }

  #execute<Result>(operation: RemoteStoreOperation, work: () => Promise<Result>): Promise<Result> {
    const request = Promise.resolve().then(work);
    const timeoutMs = this.#timeoutMs;
    const bounded =
      timeoutMs === undefined ? request : this.#withTimeout(operation, request, timeoutMs);

    return bounded.catch((error: unknown) => {
      if (error instanceof RemoteStoreError) {
        throw error;
      }
      throw new RemoteStoreError('REMOTE_STORE_NETWORK', operation, error);
    });
  }

  #withTimeout<Result>(
    operation: RemoteStoreOperation,
    request: Promise<Result>,
    timeoutMs: number,
  ): Promise<Result> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new RemoteStoreError('REMOTE_STORE_TIMEOUT', operation));
      }, timeoutMs);
    });

    return Promise.race([request, deadline]).finally(() => {
      clearTimeout(timer);
    });
  }
}
