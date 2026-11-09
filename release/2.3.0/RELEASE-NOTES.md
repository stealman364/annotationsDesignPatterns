# annotations-design-patterns 2.3.0

Stable release of the reviewed 2.3 runtime. Requires Node 20+ and TypeScript 5.0+;
supports TC39 decorators, ESM/CJS and the existing granular exports, with zero
runtime dependencies.

## Stable additions

- Functional `rateLimit()` with synchronous admission and explicit rejection.
- FIFO `maxEntries` capacity for `memoize()` and its handle variant.
- `executionMethod` for explicit access to the effective invocation context.
- Opt-in stale-operation rejection for asynchronous StateMachine transitions.
- Event adapters and explicit breaker, keyed-lock and semaphore handles.

## Contracts and migration

New modes are opt-in; existing synchronous results and default promise behavior
are preserved. `AsyncMemoryStore` now orders mutations per key and uses
clear/cleanup barriers. Reads remain non-blocking. Updaters must return the new
value instead of awaiting same-key writes or a barrier that waits for them.

Shared cancellation (`cancelWhenUnused`), `observeOperation`, external async cache
and CAS remain **experimental**. No remote provider, distributed lock protocol or
physical cancellation of uncooperative I/O is certified. CAS values must be
treated as immutable or copied by the application.

The memoize consumer has a documented size cost relative to 2.2; existing reviewed
budgets remain in force. Tooling overrides and the private documentation-only
TypeDoc patch are maintenance exceptions, not new runtime dependencies.

## Validation and installation

Validation covers Node 20/22, strict TS 5.0/5.9 ESM/CJS consumers, package metadata,
coverage, bundle budgets, full dependency audits and controlled application
integration. Controlled applications do not establish independent adoption or
production experience. See the closure and integration records beside these notes.

```sh
npm install annotations-design-patterns@2.3.0
```

- [Migration guide (ES)](https://stealman364.github.io/annotationsDesignPatterns/docs/migration/2.3/)
- [Migration guide (EN)](https://stealman364.github.io/annotationsDesignPatterns/en/docs/migration/2.3/)
- [Runtime contracts](../../V2.3-RUNTIME.md)
