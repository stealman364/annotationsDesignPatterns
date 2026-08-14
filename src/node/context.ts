import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  readonly requestId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const requestContextStorage = new AsyncLocalStorage<Readonly<RequestContext>>();

function freezeRequestContext(context: Readonly<RequestContext>): Readonly<RequestContext> {
  const metadata =
    context.metadata === undefined ? undefined : Object.freeze({ ...context.metadata });
  const copy: RequestContext = {
    requestId: context.requestId,
    ...(metadata === undefined ? {} : { metadata }),
  };

  return Object.freeze(copy);
}

/** Runs a callback with a request context isolated to its async execution chain. */
export function runWithRequestContext<Result>(
  context: Readonly<RequestContext>,
  callback: () => Result,
): Result {
  return requestContextStorage.run(freezeRequestContext(context), callback);
}

/** Returns the active request context, if the current async chain has one. */
export function getRequestContext(): Readonly<RequestContext> | undefined {
  return requestContextStorage.getStore();
}
