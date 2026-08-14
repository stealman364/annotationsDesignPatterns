---
'annotations-design-patterns': minor
---

`Retry` now rejects non-finite or out-of-range numeric options when the decorator is created, instead of silently accepting configurations that cannot retry reliably.

`Emits`, `Log`, and `Measure` now treat custom thenables like native Promises, including their rejection paths.

`Memoize` and `CachedFor` evict rejected asynchronous entries; `CircuitBreaker` validates numeric options and permits one local half-open probe.
