# Changelog

All notable changes to this project will be documented in this file. This
project follows Semantic Versioning.

## 2.0.0

### Major Changes

- 595616c: Release 2.0 changes async state transitions, constructor inheritance isolation, and DI cycle errors. See the [migration guide to 2.0](https://stealman364.github.io/annotationsDesignPatterns/docs/migration/2.0/) for details.

### Minor Changes

- Add a decorator-free functional API. `/operators` exposes `retry`, `timeout`,
  `fallback`, `circuitBreaker`, `memoize` and `cachedFor`, sharing the same engine
  as their decorators; `/pipe` composes them over any function and `/run` invokes
  a pipeline preserving its receiver and arguments. `/policy` adds `definePolicy`
  and `/decorators` is a stable facade for the resilience decorators.

- 595616c: `Retry` now rejects non-finite or out-of-range numeric options when the decorator is created, instead of silently accepting configurations that cannot retry reliably.

  `Emits`, `Log`, and `Measure` now treat custom thenables like native Promises, including their rejection paths.

  `Memoize` and `CachedFor` evict rejected asynchronous entries; `CircuitBreaker` validates numeric options and permits one local half-open probe.

- 595616c: Add stable functional policy, observability, concurrency, cache-handle, async
  store, and opt-in Node context subpaths. `overlap`, `keyedLock`,
  `memoizeWithHandle`, and `cachedForWithHandle` are available from
  `/operators`; `/store` and `/node` have explicit ESM, CJS, and type exports.

### Patch Changes

- a139274: Add a bilingual (ES/EN) documentation site (`/website`, not published to npm) combining API reference generated from `src/**` via TypeDoc with hand-maintained guides for all 10 public entrypoints. No runtime code changed — comments/JSDoc only, verified against the existing public export surface.

## 1.1.0

### Minor Changes

- Async observer improvements.
- Local development standards with Lefthook and Commitlint.
- GitHub templates for pull requests, bug reports, and feature requests.
- Release, changelog, API stability, and security documentation.

## 1.0.0 - 2026-07-03

### Added

- Initial release of `annotations-design-patterns`.
- TC39 TypeScript decorators for creational, structural, behavioral, and utility patterns.
- Dual ESM/CJS build with type declarations and granular package exports.
- Unit, composition, type, and distribution smoke tests.
