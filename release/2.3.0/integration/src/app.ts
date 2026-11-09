import { createServer } from 'node:http';
import { once } from 'node:events';
import { StateMachine, TransitionTo, When } from 'annotations-design-patterns';
import {
  CircuitBreakerOpenError,
  circuitBreaker,
  fallback,
  isRateLimitExceededError,
  memoize,
  rateLimit,
  retry,
  timeout,
} from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { executionMethod, run } from 'annotations-design-patterns/run';
import { createCounterSink } from 'annotations-design-patterns/observability';
import { AsyncMemoryStore } from 'annotations-design-patterns/store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Integration assertion failed: ${message}`);
}

async function app(): Promise<void> {
  let flakyCalls = 0;
  let timeoutCalls = 0;
  let breakerCalls = 0;
  let cacheCalls = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/flaky' && flakyCalls++ === 0) {
      response.writeHead(503).end('try again');
      return;
    }
    if (url.pathname === '/slow') {
      timeoutCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!response.destroyed) response.writeHead(200).end('slow-ok');
      return;
    }
    if (url.pathname === '/breaker') {
      breakerCalls += 1;
      response.writeHead(503).end('down');
      return;
    }
    if (url.pathname === '/cached') cacheCalls += 1;
    response.writeHead(200, { 'content-type': 'text/plain' }).end(`ok:${url.pathname}`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string', 'HTTP server bound a local port');
  const base = `http://127.0.0.1:${address.port}`;
  const counters: string[] = [];
  const eventSink = createCounterSink((name, labels) =>
    counters.push(`${name}:${labels.operator}`),
  );
  const request = executionMethod(
    async ({ signal, operationId }, path: string): Promise<string> => {
      assert(operationId !== undefined, 'run propagated operation id');
      const response = await fetch(`${base}${path}`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
  );

  try {
    const retriedGet = pipe(request, retry({ attempts: 2 }));
    assert(
      (await run({}, ['/flaky'], retriedGet, { operationId: 'retry-flaky', eventSink })) ===
        'ok:/flaky',
      'retry recovered from HTTP 503',
    );
    const timedGet = pipe(
      request,
      fallback<unknown, [string], string>(() => 'fallback-value'),
      timeout(25),
    );
    assert(
      (await run({}, ['/slow'], timedGet, { operationId: 'timeout-fallback', eventSink })) ===
        'fallback-value',
      'timeout reached fallback',
    );
    assert(timeoutCalls >= 1, 'slow endpoint was invoked');

    const breakerGet = pipe(request, circuitBreaker({ failures: 1, resetMs: 5_000 }));
    let backendFailure = false;
    try {
      await run({}, ['/breaker'], breakerGet, { operationId: 'breaker-open', eventSink });
    } catch (error) {
      backendFailure = error instanceof Error && error.message === 'HTTP 503';
    }
    assert(backendFailure, 'breaker surfaced the first backend failure');
    let breakerRejected = false;
    try {
      await run({}, ['/breaker'], breakerGet, { operationId: 'breaker-blocked', eventSink });
    } catch (error) {
      breakerRejected = error instanceof CircuitBreakerOpenError;
    }
    assert(breakerRejected, 'open breaker returned its public open error');
    assert(breakerCalls === 1, 'open breaker blocked a second HTTP request');

    const cachedGet = pipe(
      request,
      memoize<unknown, [string], string>({ key: (path) => path, maxEntries: 8 }),
    );
    const before = cacheCalls;
    const [first, second] = await Promise.all([
      run({}, ['/cached'], cachedGet, { operationId: 'memo-a', eventSink }),
      run({}, ['/cached'], cachedGet, { operationId: 'memo-b', eventSink }),
    ]);
    assert(
      first === second && cacheCalls === before + 1,
      'memoize coalesced the repeated local HTTP lookup',
    );
    const sharedPromise = Promise.resolve('identity');
    const identityCached = pipe(
      executionMethod(() => sharedPromise),
      memoize<unknown, [], string>({ key: () => 'one' }),
    );
    assert(identityCached() === identityCached(), 'memoize preserved the cached promise identity');
    const synchronousMethod = executionMethod(() => 23);
    assert(synchronousMethod() === 23, 'executionMethod preserved a synchronous return value');

    const limited = pipe(request, rateLimit({ limit: 1, windowMs: 10_000 }));
    await run({}, ['/limited'], limited, { operationId: 'rate-allowed', eventSink });
    let limitedRejected = false;
    try {
      await run({}, ['/limited-again'], limited, { operationId: 'rate-rejected', eventSink });
    } catch (error) {
      limitedRejected = isRateLimitExceededError(error);
    }
    assert(limitedRejected, 'rateLimit returned its public limit error');
    assert(
      counters.some((event) => event.startsWith('retry.attempt:retry')),
      'retry event reached application counter sink',
    );

    await validateStateMachine();
    await validateStore();
    console.log(
      JSON.stringify({
        result: 'PASS',
        scenarios: [
          'retry',
          'timeout+fallback',
          'circuit breaker',
          'memoize',
          'memoize promise identity',
          'executionMethod sync return',
          'rateLimit',
          'StateMachine inverted completion/manual invalidation/When guard',
          'AsyncMemoryStore mutation ordering',
        ],
        counters,
      }),
    );
  } finally {
    server.close();
    await once(server, 'close');
  }
}

type Status = 'draft' | 'review' | 'published';
class Document extends StateMachine<Status> {
  constructor() {
    super('draft');
  }
  @When('draft')
  @TransitionTo('review', { concurrency: 'reject-stale' })
  async submit(wait: Promise<void>): Promise<string> {
    await wait;
    return 'submitted';
  }
  @TransitionTo('published')
  publishManually(): void {
    this.transitionTo('published');
  }
}

async function validateStateMachine(): Promise<void> {
  const doc = new Document();
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const firstPending = doc.submit(firstGate);
  assert(doc.state === 'draft', 'outer @When guard allowed a draft transition');
  let releaseSecond!: () => void;
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  const secondPending = doc.submit(secondGate);
  releaseSecond();
  await secondPending;
  assert(String(doc.state) === 'review', 'second concurrent submission committed first');
  releaseFirst();
  let staleRejected = false;
  try {
    await firstPending;
  } catch (error) {
    staleRejected = error instanceof Error && error.name === 'StateTransitionConflictError';
  }
  assert(
    staleRejected && String(doc.state) === 'review',
    'later completion rejected its stale transition',
  );
  doc.transitionTo('draft');
  let manualRelease!: () => void;
  const manualGate = new Promise<void>((resolve) => {
    manualRelease = resolve;
  });
  const manualPending = doc.submit(manualGate);
  doc.publishManually();
  manualRelease();
  let manualStaleRejected = false;
  try {
    await manualPending;
  } catch (error) {
    manualStaleRejected = error instanceof Error && error.name === 'StateTransitionConflictError';
  }
  assert(
    manualStaleRejected && String(doc.state) === 'published',
    'manual transition invalidated stale async commit',
  );
  let invertedGuardRejected = false;
  try {
    await doc.submit(Promise.resolve());
  } catch {
    invertedGuardRejected = true;
  }
  assert(invertedGuardRejected, '@When guard remained outside the transition decorator');
}

async function validateStore(): Promise<void> {
  const store = new AsyncMemoryStore<string, number>();
  await store.set('count', 0);
  const update = (): Promise<number> =>
    store.update('count', async (value) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      assert(
        (await store.get('count')) === (value ?? 0),
        'updater can await committed-value reads without deadlock',
      );
      return (value ?? 0) + 1;
    });
  const first = update();
  const second = update();
  assert(
    (await store.get('count')) === 0,
    'reads returned the latest committed value without waiting',
  );
  await Promise.all([first, second]);
  assert((await store.get('count')) === 2, 'same-key updater mutations serialized');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const beforeClear = store.update('count', async (value) => {
    await gate;
    return (value ?? 0) + 1;
  });
  const clear = store.clear();
  const afterClear = store.set('count', 9);
  release();
  await Promise.all([beforeClear, clear, afterClear]);
  assert(
    (await store.get('count')) === 9,
    'clear barrier ordered already admitted and later mutations',
  );
}

void app().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
