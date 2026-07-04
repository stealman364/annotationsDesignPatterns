// Smoke test del build ESM: verifica que dist/index.js exporta y funciona.
import assert from 'node:assert/strict';
import * as lib from '../dist/index.js';

assert.equal(typeof lib.Subject, 'function', 'Subject debe exportarse');
assert.equal(typeof lib.Emits, 'function', 'Emits debe exportarse');

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

console.log('smoke ESM (dist/index.js) OK');
