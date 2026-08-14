// Smoke test del build CJS: verifica que dist/index.cjs exporta y funciona.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const lib = require('../dist/index.cjs');
const { hedge, switchOverlap } = require('../dist/experimental/index.cjs');
const { getRequestContext, runWithRequestContext } = require('../dist/node/index.cjs');
const { fallback, isPolicyError, PolicyError } = require('../dist/public/operators.cjs');
const { pipe } = require('../dist/public/pipe.cjs');
const { run } = require('../dist/public/run.cjs');
const { Retry: DecoratorRetry } = require('../dist/decorators/index.cjs');
const { NoopEventSink } = require('../dist/observability/index.cjs');
const { definePolicy, InvalidPolicyError } = require('../dist/policy/index.cjs');
const { AsyncMemoryStore, RemoteAsyncStore } = require('../dist/store/index.cjs');

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
  readFileSync(require.resolve('../dist/index.cjs'), 'utf8'),
  /node:async_hooks/,
  'el entrypoint raÃ­z CJS no debe incluir Node',
);
const store = new AsyncMemoryStore();
assert.equal(store.capabilities.atomic, true, 'AsyncMemoryStore debe exportarse desde /store');
assert.equal(typeof RemoteAsyncStore, 'function', 'RemoteAsyncStore debe exportarse desde /store');
assert.equal(
  runWithRequestContext({ requestId: 'cjs-store-node' }, () => getRequestContext()?.requestId),
  'cjs-store-node',
  'el contexto Node debe exportarse desde /node',
);
const invalidPolicyError = new InvalidPolicyError('retry.attempts', 'must be positive');
assert.equal(
  invalidPolicyError instanceof PolicyError,
  true,
  'los PolicyError de /policy deben conservar instanceof a travÃ©s de entradas CJS',
);
assert.equal(
  isPolicyError(invalidPolicyError),
  true,
  'los PolicyError de /policy deben identificarse desde /operators',
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
    operationId: 'cjs-smoke-operation',
    eventSink: { emit: (event) => contextualEvents.push(event) },
  }),
  'recovered',
  'run debe encontrar el contexto registrado por pipe desde otra entrada CJS',
);
assert.deepEqual(
  contextualEvents.map((event) => event.kind),
  ['fallback.used'],
  'la observabilidad debe cruzar los entrypoints CJS',
);

async function verifyPolicyFacade() {
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
  console.log('smoke CJS (dist/index.cjs) OK');
}

verifyPolicyFacade().catch((error) => {
  console.error(error);
  throw error;
});
