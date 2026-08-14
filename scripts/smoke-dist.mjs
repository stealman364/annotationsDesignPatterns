// Smoke test del build ESM: verifica que dist/index.js exporta y funciona.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as lib from '../dist/index.js';
import { hedge, switchOverlap } from '../dist/experimental/index.js';
import { getRequestContext, runWithRequestContext } from '../dist/node/index.js';
import { fallback, isPolicyError, PolicyError } from '../dist/public/operators.js';
import { pipe } from '../dist/public/pipe.js';
import { run } from '../dist/public/run.js';
import { Retry as DecoratorRetry } from '../dist/decorators/index.js';
import { NoopEventSink } from '../dist/observability/index.js';
import { definePolicy } from '../dist/policy/index.js';
import { AsyncMemoryStore, RemoteAsyncStore } from '../dist/store/index.js';

assert.equal(typeof lib.Subject, 'function', 'Subject debe exportarse');
assert.equal(typeof lib.Emits, 'function', 'Emits debe exportarse');
assert.equal(typeof hedge, 'function', 'hedge debe exportarse desde /experimental');
assert.equal(typeof switchOverlap, 'function', 'switchOverlap debe exportarse desde /experimental');
assert.equal(typeof DecoratorRetry, 'function', 'Retry debe exportarse desde /decorators');
assert.equal(
  typeof NoopEventSink,
  'function',
  'NoopEventSink debe exportarse desde /observability',
);
assert.equal(isPolicyError(new PolicyError('smoke')), true, 'PolicyError debe identificarse');
assert.doesNotMatch(
  await readFile(new URL('../dist/index.js', import.meta.url), 'utf8'),
  /node:async_hooks/,
  'el entrypoint raÃ­z ESM no debe incluir Node',
);

const store = new AsyncMemoryStore();
await store.set('smoke', 'store');
assert.equal(await store.get('smoke'), 'store', 'AsyncMemoryStore debe exportarse desde /store');
assert.equal(typeof RemoteAsyncStore, 'function', 'RemoteAsyncStore debe exportarse desde /store');
assert.equal(
  runWithRequestContext({ requestId: 'esm-store-node' }, () => getRequestContext()?.requestId),
  'esm-store-node',
  'el contexto Node debe exportarse desde /node',
);

// Subject funciona
const subject = new lib.Subject();
const received = [];
subject.on('evento', (p) => received.push(p));
subject.emit('evento', 42);
assert.deepEqual(received, [42]);

// Un decorador puede invocarse manualmente (context simulado)
const wrapped = lib.Emits('done')(
  function () {
    return 'ok';
  },
  { kind: 'method', name: 'run' },
);
const host = new lib.Subject();
const emitted = [];
host.on('done', (p) => emitted.push(p));
assert.equal(wrapped.call(host), 'ok');
assert.deepEqual(emitted, ['ok']);

const piped = pipe(function (value) {
  return `value:${value}`;
}, fallback('fallback'));
assert.equal(piped.call({}, 'ok'), 'value:ok');
assert.equal(
  run({ prefix: 'public' }, ['value'], function (value) {
    return `${this.prefix}:${value}`;
  }),
  'public:value',
);

const contextualEvents = [];
const observable = pipe(function () {
  throw new Error('upstream failure');
}, fallback('recovered'));
assert.equal(
  run({}, [], observable, {
    operationId: 'esm-smoke-operation',
    eventSink: { emit: (event) => contextualEvents.push(event) },
  }),
  'recovered',
  'run debe encontrar el contexto registrado por pipe desde otra entrada ESM',
);
assert.deepEqual(
  contextualEvents.map((event) => event.kind),
  ['fallback.used'],
  'la observabilidad debe cruzar los entrypoints ESM',
);

let policyAttempts = 0;
const policy = definePolicy({
  fallback: { value: 'policy-recovered' },
  retry: { attempts: 2, idempotent: true },
});
const policyProtected = pipe(function () {
  policyAttempts += 1;
  throw new Error('policy upstream failure');
}, policy.operator());
assert.equal(
  await run({}, [], policyProtected),
  'policy-recovered',
  'definePolicy debe componer fallback y retry desde /policy',
);
assert.equal(policyAttempts, 2, 'definePolicy debe ejecutar los reintentos configurados');

console.log('smoke ESM (dist/index.js) OK');
