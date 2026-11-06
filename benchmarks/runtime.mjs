import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { platform, arch } from 'node:process';
import { Memoize } from '../dist/index.js';
import { fallback, memoize, retry, circuitBreaker, semaphore } from '../dist/public/operators.js';
import { pipe } from '../dist/public/pipe.js';
import { definePolicy } from '../dist/policy/index.js';

function option(name, defaultValue) {
  const index = process.argv.indexOf(name);
  return index === -1 ? defaultValue : process.argv[index + 1];
}
function count(name, defaultValue) {
  const value = Number(option(name, defaultValue));
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive safe integer`);
  return value;
}
const iterations = count('--iterations', 20_000);
const warmup = count('--warmup', 5_000);
const samples = count('--samples', 7);
const receiver = {};
const direct = (value = 1) => value;
const context = {
  kind: 'method',
  name: 'operation',
  static: false,
  private: false,
  access: { has: (value) => 'operation' in value, get: (value) => value.operation },
  addInitializer() {},
};
const cases = [
  ['direct call', () => () => direct.call(receiver)],
  [
    'operator',
    () => {
      const fn = fallback(0).apply(direct);
      return () => fn.call(receiver);
    },
  ],
  [
    'decorator',
    () => {
      const fn = Memoize(direct, context);
      return () => fn.call(receiver);
    },
  ],
  [
    'pipe',
    () => {
      const fn = pipe(direct, fallback(0));
      return () => fn.call(receiver);
    },
  ],
  [
    'policy',
    () => {
      const fn = definePolicy({ fallback: { value: 0 } })
        .operator()
        .apply(direct);
      return () => fn.call(receiver);
    },
  ],
  [
    'memoize hit',
    () => {
      const fn = memoize().apply(direct);
      fn.call(receiver, 1);
      return () => fn.call(receiver, 1);
    },
  ],
  [
    'memoize miss',
    () => {
      const fn = memoize().apply(direct);
      let key = 0;
      return () => fn.call(receiver, ++key);
    },
  ],
  [
    'retry success path',
    () => {
      const fn = retry({ attempts: 3 }).apply(direct);
      return () => fn.call(receiver);
    },
  ],
  [
    'circuit breaker closed path',
    () => {
      const fn = circuitBreaker({ failures: 5, resetMs: 1_000 }).apply(direct);
      return () => fn.call(receiver);
    },
  ],
  [
    'semaphore uncontended',
    () => {
      const fn = semaphore({ permits: 1 }).apply(direct);
      return () => fn.call(receiver);
    },
    true,
  ],
];

let checksum = 0;
async function measure(factory, asynchronous, count_) {
  const invoke = factory(); // Fresh closure/cache outside each timed sample.
  const start = performance.now();
  if (asynchronous) {
    for (let index = 0; index < count_; index++) checksum += Number(await invoke());
  } else {
    for (let index = 0; index < count_; index++) checksum += Number(invoke());
  }
  return ((performance.now() - start) * 1_000_000) / count_;
}

const results = [];
for (const [name, factory, asynchronous = false] of cases) {
  await measure(factory, asynchronous, warmup);
  const times = [];
  for (let sample = 0; sample < samples; sample++)
    times.push(await measure(factory, asynchronous, iterations));
  times.sort((a, b) => a - b);
  results.push({
    name,
    asynchronous,
    medianNsPerOp: times[Math.floor(times.length / 2)],
    p95SampleNsPerOp: times[Math.ceil(times.length * 0.95) - 1],
    samplesNsPerOp: times,
  });
}
const report = {
  libraryVersion: JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    .version,
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform,
  arch,
  iterations,
  warmup,
  samples,
  units: 'ns/op; percentile of sample averages, not per-call latency',
  checksum,
  results,
};
const comparisonPath = option('--compare');
if (comparisonPath !== undefined) {
  const previous = JSON.parse(readFileSync(comparisonPath, 'utf8'));
  if (
    previous.node !== report.node ||
    previous.platform !== platform ||
    previous.arch !== arch ||
    previous.iterations !== iterations ||
    previous.warmup !== warmup ||
    previous.samples !== samples
  ) {
    throw new Error('Comparison requires identical runtime, platform and sampling parameters');
  }
  const maximumRatio = Number(option('--max-ratio', 3));
  if (!Number.isFinite(maximumRatio) || maximumRatio <= 1)
    throw new RangeError('--max-ratio must exceed 1');
  for (const result of results) {
    const before = previous.results.find(({ name }) => name === result.name);
    if (before === undefined || !Number.isFinite(before.medianNsPerOp) || before.medianNsPerOp <= 0)
      throw new Error(`Missing valid baseline: ${result.name}`);
    result.ratio = result.medianNsPerOp / before.medianNsPerOp;
    if (result.ratio > maximumRatio) process.exitCode = 1;
  }
}
const json = JSON.stringify(report, null, 2) + '\n';
const output = option('--output');
if (output !== undefined) writeFileSync(output, json);
console.log(json);
