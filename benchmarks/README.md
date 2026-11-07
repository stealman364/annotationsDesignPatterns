# Runtime benchmarks

Run `npm run bench` after installing the repository's existing development tools.
No benchmark dependency is added. The runner imports the built distribution.

```powershell
npm run bench -- --iterations 20000 --warmup 5000 --samples 7 --output baseline.json
npm run bench -- --iterations 20000 --warmup 5000 --samples 7 --compare baseline.json --max-ratio 3
```

Ten cases cover direct calls, a directly applied operator, the actual Memoize
decorator wrapper applied with a TC39 method context, pipe, policy, memoize
hit/miss, retry success, closed circuit breaker and uncontended semaphore.
The Promise-returning semaphore is awaited; synchronous paths have no artificial
await. Do not compare those two categories as if they measured identical work.

Each case warms up, takes multiple samples and creates its closure/cache outside
each timed sample. The miss cache is bounded by one sample's iteration count.
A consumed checksum prevents discarded results. Results include Node version,
platform, architecture and sampling parameters. Percentiles describe sample
averages, not individual invocation latency.

Comparisons require matching environment and parameters. A ratio over the
explicit threshold returns exit code 1; the default 3x threshold is intended to
find large changes on a stable machine, not certify small optimizations.
Machine load, JIT, garbage collection and CPU frequency affect results. CI size
budgets remain deterministic; benchmark timings are recorded separately and are
not a noisy mandatory timing gate.
