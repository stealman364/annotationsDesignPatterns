import type { ContextualMethod, RuntimeOperationContext } from '../core/context';
import { raceWithSignal } from '../core/cancellation';
import { isDuration, isTimerDelay } from '../core/numeric';
import { withoutContext, type ContextualOperator } from '../core/contextual-operator';
import type { StoreEntryOptions } from '../core/store';
import type { Operator } from '../core/operator';
import type { AnyMethod } from '../core/types';

const asyncCacheErrorBrand = Symbol.for('annotations-design-patterns.async-cache-error');

export type AsyncCacheErrorPhase = 'key' | 'read' | 'schema' | 'decode' | 'encode' | 'write';

/** Branded failure from the experimental external-cache boundary. */
export class AsyncCacheError extends Error {
  override readonly cause: unknown;

  constructor(
    readonly phase: AsyncCacheErrorPhase,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AsyncCacheError';
    this.cause = cause;
    Object.defineProperty(this, asyncCacheErrorBrand, { value: true });
  }
}

/** Recognizes experimental external-cache errors across package copies. */
export function isAsyncCacheError(error: unknown): error is AsyncCacheError {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return false;
  try {
    return (error as Record<PropertyKey, unknown>)[asyncCacheErrorBrand] === true;
  } catch {
    return false;
  }
}

export interface AsyncCacheProvider {
  readonly capabilities: { readonly ttl: boolean };
  get(key: string): unknown | PromiseLike<unknown>;
  set(key: string, value: unknown, options?: StoreEntryOptions): unknown | PromiseLike<unknown>;
}

export interface AsyncCacheCodec<Result> {
  encode(value: Result): unknown;
  decode(payload: unknown): Result;
}

export interface AsyncCacheDiagnostic {
  readonly phase: 'read' | 'write';
  readonly error: AsyncCacheError;
}

export interface AsyncCachedForOptions<Args extends readonly unknown[], Result> {
  readonly store: AsyncCacheProvider;
  readonly namespace: string;
  readonly schemaVersion: string;
  readonly key: (...args: Args) => string;
  readonly codec: AsyncCacheCodec<Result>;
  readonly storeFailure: 'bypass' | 'reject';
  readonly ioTimeoutMs: number;
  readonly onDiagnostic?: (diagnostic: AsyncCacheDiagnostic) => void | PromiseLike<void>;
}

interface CacheEnvelope {
  readonly version: 1;
  readonly payload: unknown;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  try {
    return (
      ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
      typeof (value as PromiseLike<unknown>).then === 'function'
    );
  } catch {
    return true;
  }
}

function validateOptions<Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: AsyncCachedForOptions<Args, Result>,
): void {
  if (!isDuration(ttlMs, false))
    throw new RangeError('asyncCachedFor ttlMs must be finite and positive');
  if (!isTimerDelay(options.ioTimeoutMs, false)) {
    throw new RangeError('asyncCachedFor ioTimeoutMs must be a portable finite positive delay');
  }
  if (typeof options.namespace !== 'string' || options.namespace.length === 0) {
    throw new TypeError('asyncCachedFor namespace must be a non-empty string');
  }
  if (typeof options.schemaVersion !== 'string' || options.schemaVersion.length === 0) {
    throw new TypeError('asyncCachedFor schemaVersion must be a non-empty string');
  }
  if (typeof options.key !== 'function')
    throw new TypeError('asyncCachedFor requires an explicit key function');
  if (options.storeFailure !== 'bypass' && options.storeFailure !== 'reject') {
    throw new TypeError('asyncCachedFor storeFailure must be bypass or reject');
  }
  if (typeof options.codec?.encode !== 'function' || typeof options.codec.decode !== 'function') {
    throw new TypeError('asyncCachedFor requires synchronous encode and decode functions');
  }
  if (options.store?.capabilities?.ttl !== true) {
    throw new TypeError('asyncCachedFor requires a provider with declared TTL capability');
  }
  if (typeof options.store.get !== 'function' || typeof options.store.set !== 'function') {
    throw new TypeError('asyncCachedFor provider must implement get and set');
  }
}

function aborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw signal.reason;
}

function emitDiagnostic(
  callback: AsyncCachedForOptions<readonly unknown[], unknown>['onDiagnostic'],
  diagnostic: AsyncCacheDiagnostic,
): void {
  if (callback === undefined) return;
  try {
    const result = callback(diagnostic);
    if (isPromiseLike(result)) void Promise.resolve(result).catch(() => undefined);
  } catch {
    // Diagnostics cannot change the cache or business result.
  }
}

function withIoTimeout<Result>(
  phase: 'read' | 'write',
  invoke: () => Result | PromiseLike<Result>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<Result> {
  aborted(signal);
  let request: Promise<Result>;
  try {
    request = Promise.resolve(invoke());
  } catch (error) {
    request = Promise.reject(error);
  }
  // Observe provider work even if its caller aborts or its deadline wins.
  void request.catch(() => undefined);

  return new Promise<Result>((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      complete();
    };
    const onAbort = (): void => finish(() => reject(signal?.reason));
    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new AsyncCacheError(phase, `External cache ${phase} timed out after ${timeoutMs}ms`),
        ),
      );
    }, timeoutMs);

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
    void request.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) =>
        finish(() => reject(new AsyncCacheError(phase, `External cache ${phase} failed`, error))),
    );
  });
}

function parseEnvelope(value: unknown): CacheEnvelope | undefined {
  if (value === undefined) return undefined;
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      (value as { version?: unknown }).version !== 1 ||
      !Object.prototype.hasOwnProperty.call(value, 'payload')
    ) {
      throw new TypeError('Unsupported cache envelope');
    }
    // Snapshot the payload inside the schema boundary: provider accessors and
    // proxy traps can throw before a codec is invoked.
    return { version: 1, payload: (value as CacheEnvelope).payload };
  } catch (error) {
    throw new AsyncCacheError('schema', 'External cache value has an unsupported envelope', error);
  }
}

function encode<Result>(codec: AsyncCacheCodec<Result>, value: Result): unknown {
  let payload: unknown;
  try {
    payload = codec.encode(value);
  } catch (error) {
    throw new AsyncCacheError('encode', 'External cache codec failed to encode a result', error);
  }
  if (isPromiseLike(payload)) {
    void Promise.resolve(payload).catch(() => undefined);
    throw new AsyncCacheError('encode', 'External cache encode must be synchronous');
  }
  return payload;
}

function decode<Result>(codec: AsyncCacheCodec<Result>, payload: unknown): Result {
  let value: Result;
  try {
    value = codec.decode(payload);
  } catch (error) {
    throw new AsyncCacheError('decode', 'External cache codec failed to decode a payload', error);
  }
  if (isPromiseLike(value)) {
    void Promise.resolve(value).catch(() => undefined);
    throw new AsyncCacheError('decode', 'External cache decode must be synchronous');
  }
  return value;
}

function createContextualOperator<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: AsyncCachedForOptions<Args, Result>,
): ContextualOperator<This, Args, Result, Result> {
  const applyWithContext = (
    next: ContextualMethod<This, Args, Result>,
  ): ContextualMethod<This, Args, Result> =>
    async function (
      this: This,
      context: RuntimeOperationContext<This, Args> | undefined,
      ...args: Args
    ): Promise<Result> {
      const signal = context?.signal;
      aborted(signal);

      let keyPart: string;
      try {
        keyPart = options.key(...args);
      } catch (error) {
        throw new AsyncCacheError('key', 'External cache key function failed', error);
      }
      if (typeof keyPart !== 'string') {
        throw new AsyncCacheError('key', 'External cache key function must return a string');
      }
      const key = JSON.stringify([options.namespace, options.schemaVersion, keyPart]);

      let cachedValue: unknown;
      let bypassStore = false;
      try {
        cachedValue = await withIoTimeout(
          'read',
          () => options.store.get(key),
          options.ioTimeoutMs,
          signal,
        );
      } catch (error) {
        if (signal?.aborted === true) throw signal.reason;
        if (!isAsyncCacheError(error) || error.phase !== 'read') throw error;
        emitDiagnostic(options.onDiagnostic, { phase: 'read', error });
        if (options.storeFailure === 'reject') throw error;
        bypassStore = true;
      }

      aborted(signal);
      if (!bypassStore) {
        const envelope = parseEnvelope(cachedValue);
        if (envelope !== undefined) {
          const result = decode(options.codec, envelope.payload);
          aborted(signal);
          return result;
        }
      }

      aborted(signal);
      const result = await raceWithSignal(next.call(this, context, ...args), signal);
      aborted(signal);
      if (bypassStore) return result;

      const payload = encode(options.codec, result);
      aborted(signal);
      const envelope: CacheEnvelope = { version: 1, payload };
      aborted(signal);
      try {
        await withIoTimeout(
          'write',
          () => options.store.set(key, envelope, { ttlMs }),
          options.ioTimeoutMs,
          signal,
        );
      } catch (error) {
        if (signal?.aborted === true) throw signal.reason;
        if (!isAsyncCacheError(error) || error.phase !== 'write') throw error;
        emitDiagnostic(options.onDiagnostic, { phase: 'write', error });
        if (options.storeFailure === 'reject') throw error;
      }
      return result;
    };

  return {
    name: 'asyncCachedFor',
    apply(next: AnyMethod<This, Args, Result>): AnyMethod<This, Args, Result> {
      const contextualNext: ContextualMethod<This, Args, Result> = function (
        this: This,
        _context,
        ...args: Args
      ) {
        return next.call(this, ...args);
      };
      return withoutContext(applyWithContext(contextualNext));
    },
    applyWithContext,
  };
}

/** Experimental async cache backed by an explicitly TTL-capable external provider. */
export function asyncCachedFor<This, Args extends readonly unknown[], Result>(
  ttlMs: number,
  options: AsyncCachedForOptions<Args, Result>,
): Operator<This, Args, Result, Result> {
  validateOptions(ttlMs, options);
  const codec = Object.freeze({
    encode: options.codec.encode.bind(options.codec),
    decode: options.codec.decode.bind(options.codec),
  });
  const configuration: AsyncCachedForOptions<Args, Result> = Object.freeze({
    store: options.store,
    namespace: options.namespace,
    schemaVersion: options.schemaVersion,
    key: options.key,
    codec,
    storeFailure: options.storeFailure,
    ioTimeoutMs: options.ioTimeoutMs,
    onDiagnostic: options.onDiagnostic,
  });
  return createContextualOperator(ttlMs, configuration);
}
