import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'annotations-design-patterns-package-'));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, arguments_, cwd, captureOutput = false) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === npmCommand,
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

try {
  const packOutput = run(
    npmCommand,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryDirectory],
    repositoryRoot,
    true,
  );
  const jsonStart = packOutput.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('npm pack did not produce JSON output.');
  }

  const [{ filename }] = JSON.parse(packOutput.slice(jsonStart));
  const tarball = join(temporaryDirectory, filename);
  const consumerDirectory = join(temporaryDirectory, 'consumer');
  const esmSmoke = join(consumerDirectory, 'esm.mjs');
  const cjsSmoke = join(consumerDirectory, 'cjs.cjs');
  const typeSmoke = join(consumerDirectory, 'types.ts');
  const policyEsmSmoke = join(consumerDirectory, 'policy-esm.mjs');
  const policyCjsSmoke = join(consumerDirectory, 'policy-cjs.cjs');
  const policyTypeSmoke = join(consumerDirectory, 'policy-types.ts');
  const experimentalEsmSmoke = join(consumerDirectory, 'experimental-esm.mjs');
  const experimentalCjsSmoke = join(consumerDirectory, 'experimental-cjs.cjs');
  const experimentalTypeSmoke = join(consumerDirectory, 'experimental-types.ts');

  mkdirSync(consumerDirectory);
  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'package-smoke-consumer', private: true, type: 'module' }),
  );
  run(npmCommand, ['install', '--ignore-scripts', '--no-package-lock', tarball], consumerDirectory);

  writeFileSync(
    esmSmoke,
    "import { Retry } from 'annotations-design-patterns';\nimport { Singleton } from 'annotations-design-patterns/creational/singleton';\nimport { Retry as GranularRetry } from 'annotations-design-patterns/utility/retry';\nimport { Retry as DecoratorRetry } from 'annotations-design-patterns/decorators';\nimport { LoggerEventSink, NoopEventSink } from 'annotations-design-patterns/observability';\nimport { fallback, PolicyError, isPolicyError } from 'annotations-design-patterns/operators';\nimport { pipe } from 'annotations-design-patterns/pipe';\nimport { run } from 'annotations-design-patterns/run';\nimport { AsyncMemoryStore, RemoteAsyncStore } from 'annotations-design-patterns/store';\nimport { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';\nif (typeof Retry !== 'function' || typeof Singleton !== 'function' || typeof GranularRetry !== 'function' || typeof DecoratorRetry !== 'function') throw new Error('Decorator ESM exports are unavailable');\nif (typeof LoggerEventSink !== 'function') throw new Error('Logger observability ESM export is unavailable');\nif (typeof RemoteAsyncStore !== 'function') throw new Error('Remote store ESM export is unavailable');\nconst policyError = new PolicyError('package smoke');\nif (!isPolicyError(policyError)) throw new Error('Policy error ESM exports are unavailable');\nconst noopSink = new NoopEventSink();\nnoopSink.emit({ kind: 'fallback.used', operationId: 'package-smoke', operator: 'package', timestamp: 0, metadata: {}, error: policyError });\nfor (const internalPath of ['annotations-design-patterns/core', 'annotations-design-patterns/store/async-memory-store', 'annotations-design-patterns/store/remote-store', 'annotations-design-patterns/node/context']) { let wasRejected = false; try { await import(internalPath); } catch { wasRejected = true; } if (!wasRejected) throw new Error(`${internalPath} must not be importable from the package`); }\nconst store = new AsyncMemoryStore();\nawait store.set('package', 'store');\nif (await store.get('package') !== 'store') throw new Error('Store ESM export is unavailable');\nif (runWithRequestContext({ requestId: 'esm-package' }, () => getRequestContext()?.requestId) !== 'esm-package') throw new Error('Node ESM export is unavailable');\nconst piped = pipe(function (value) { return `value:${value}`; }, fallback('fallback'));\nif (piped.call({}, 'ok') !== 'value:ok') throw new Error('Functional ESM pipe export is unavailable');\nconst fallbackEvents = [];\nconst contextualFallback = pipe(function () { throw new Error('unavailable'); }, fallback('recovered'));\nconst recovered = run({}, [], contextualFallback, { operationId: 'esm-fallback', eventSink: { emit(event) { fallbackEvents.push(event); } } });\nif (recovered !== 'recovered') throw new Error('Contextual ESM fallback result is unavailable');\nif (fallbackEvents.length !== 1 || fallbackEvents[0].kind !== 'fallback.used' || fallbackEvents[0].operator !== 'fallback' || fallbackEvents[0].operationId !== 'esm-fallback') throw new Error('Contextual ESM fallback event is unavailable');\nif (run({ prefix: 'public' }, ['value'], function (value) { return `${this.prefix}:${value}`; }) !== 'public:value') throw new Error('Functional ESM run export is unavailable');\n",
  );
  writeFileSync(
    cjsSmoke,
    "const { Retry } = require('annotations-design-patterns');\nconst { Singleton } = require('annotations-design-patterns/creational/singleton');\nconst { Retry: GranularRetry } = require('annotations-design-patterns/utility/retry');\nconst { Retry: DecoratorRetry } = require('annotations-design-patterns/decorators');\nconst { LoggerEventSink, NoopEventSink } = require('annotations-design-patterns/observability');\nconst { fallback, PolicyError, isPolicyError } = require('annotations-design-patterns/operators');\nconst { pipe } = require('annotations-design-patterns/pipe');\nconst { run } = require('annotations-design-patterns/run');\nconst { AsyncMemoryStore, RemoteAsyncStore } = require('annotations-design-patterns/store');\nconst { getRequestContext, runWithRequestContext } = require('annotations-design-patterns/node');\nif (typeof Retry !== 'function' || typeof Singleton !== 'function' || typeof GranularRetry !== 'function' || typeof DecoratorRetry !== 'function') throw new Error('Decorator CJS exports are unavailable');\nif (typeof LoggerEventSink !== 'function') throw new Error('Logger observability CJS export is unavailable');\nif (typeof RemoteAsyncStore !== 'function') throw new Error('Remote store CJS export is unavailable');\nconst policyError = new PolicyError('package smoke');\nif (!isPolicyError(policyError)) throw new Error('Policy error CJS exports are unavailable');\nconst noopSink = new NoopEventSink();\nnoopSink.emit({ kind: 'fallback.used', operationId: 'package-smoke', operator: 'package', timestamp: 0, metadata: {}, error: policyError });\nfor (const internalPath of ['annotations-design-patterns/core', 'annotations-design-patterns/store/async-memory-store', 'annotations-design-patterns/store/remote-store', 'annotations-design-patterns/node/context']) { let wasRejected = false; try { require(internalPath); } catch { wasRejected = true; } if (!wasRejected) throw new Error(`${internalPath} must not be importable from the package`); }\nconst store = new AsyncMemoryStore();\nif (!store.capabilities.atomic) throw new Error('Store CJS export is unavailable');\nif (runWithRequestContext({ requestId: 'cjs-package' }, () => getRequestContext()?.requestId) !== 'cjs-package') throw new Error('Node CJS export is unavailable');\nconst piped = pipe(function (value) { return `value:${value}`; }, fallback('fallback'));\nif (piped.call({}, 'ok') !== 'value:ok') throw new Error('Functional CJS pipe export is unavailable');\nconst fallbackEvents = [];\nconst contextualFallback = pipe(function () { throw new Error('unavailable'); }, fallback('recovered'));\nconst recovered = run({}, [], contextualFallback, { operationId: 'cjs-fallback', eventSink: { emit(event) { fallbackEvents.push(event); } } });\nif (recovered !== 'recovered') throw new Error('Contextual CJS fallback result is unavailable');\nif (fallbackEvents.length !== 1 || fallbackEvents[0].kind !== 'fallback.used' || fallbackEvents[0].operator !== 'fallback' || fallbackEvents[0].operationId !== 'cjs-fallback') throw new Error('Contextual CJS fallback event is unavailable');\nif (run({ prefix: 'public' }, ['value'], function (value) { return `${this.prefix}:${value}`; }) !== 'public:value') throw new Error('Functional CJS run export is unavailable');\n",
  );
  writeFileSync(
    typeSmoke,
    "import { Retry } from 'annotations-design-patterns';\nimport { Singleton } from 'annotations-design-patterns/creational/singleton';\nimport { Retry as GranularRetry } from 'annotations-design-patterns/utility/retry';\nimport { Retry as DecoratorRetry, type CachedForOptions, type CircuitBreakerOptions, type KeyResolver, type MemoizeOptions, type RetryOptions as DecoratorRetryOptions } from 'annotations-design-patterns/decorators';\nimport { LoggerEventSink, NoopEventSink, type EventSink, type PolicyEvent } from 'annotations-design-patterns/observability';\nimport { fallback, isPolicyError, PolicyError, type RetryOptions } from 'annotations-design-patterns/operators';\nimport { pipe } from 'annotations-design-patterns/pipe';\nimport { run, type RunOptions } from 'annotations-design-patterns/run';\nimport { AsyncMemoryStore, RemoteAsyncStore, requireAtomicStore, type AtomicAsyncStore, type RemoteStoreTransport, type StoreCapabilities } from 'annotations-design-patterns/store';\nimport { getRequestContext, runWithRequestContext, type RequestContext } from 'annotations-design-patterns/node';\ntype Receiver = { readonly prefix: string };\nconst receiver: Receiver = { prefix: 'public' };\nconst method = function (this: Receiver, value: string): string { return `${this.prefix}:${value}`; };\nconst options: RetryOptions = { attempts: 2 };\nconst decoratorOptions: DecoratorRetryOptions = { attempts: 2 };\nconst breakerOptions: CircuitBreakerOptions = { failures: 2, resetMs: 100 };\nconst memoizeOptions: MemoizeOptions = {};\nconst cachedForOptions: CachedForOptions = {};\nconst keyResolver: KeyResolver = () => 'cache-key';\nconst event: PolicyEvent = { kind: 'fallback.used', operationId: 'package-smoke', operator: 'package', timestamp: 0, metadata: {}, error: new Error('original') };\nconst eventSink: EventSink = new NoopEventSink();\nconst runOptions: RunOptions = { operationId: 'package-smoke', metadata: { surface: 'package' }, eventSink };\nconst policyError = new PolicyError('package smoke');\nconst loggerEventSink: typeof LoggerEventSink = LoggerEventSink;\nconst memoryStore: AtomicAsyncStore<string, number> = new AsyncMemoryStore<string, number>();\nconst storeCapabilities: StoreCapabilities = memoryStore.capabilities;\nconst remoteStoreConstructor: typeof RemoteAsyncStore = RemoteAsyncStore;\nconst remoteTransport: RemoteStoreTransport<string, number> = memoryStore;\nconst requestContext: RequestContext = { requestId: 'types-package' };\nconst requestId = runWithRequestContext(requestContext, () => getRequestContext()?.requestId);\nrequireAtomicStore(memoryStore, 'lock');\neventSink.emit(event);\nif (!isPolicyError(policyError)) throw new Error('Policy error type exports are unavailable');\nconst piped = pipe(method, fallback<Receiver, readonly [value: string], string>('fallback'));\nconst result = run(receiver, ['value'] as const, piped, runOptions);\nconst rootDecorator: typeof Retry = Retry;\nconst singletonDecorator: typeof Singleton = Singleton;\nconst granularDecorator: typeof GranularRetry = GranularRetry;\nconst decoratorFacade: typeof Retry = DecoratorRetry;\nvoid options;\nvoid decoratorOptions;\nvoid breakerOptions;\nvoid memoizeOptions;\nvoid cachedForOptions;\nvoid keyResolver;\nvoid loggerEventSink;\nvoid result;\nvoid rootDecorator;\nvoid singletonDecorator;\nvoid granularDecorator;\nvoid decoratorFacade;\nvoid storeCapabilities;\nvoid remoteStoreConstructor;\nvoid remoteTransport;\nvoid requestId;\n",
  );
  writeFileSync(
    policyEsmSmoke,
    "import { definePolicy } from 'annotations-design-patterns/policy';\nimport { pipe } from 'annotations-design-patterns/pipe';\nimport { run } from 'annotations-design-patterns/run';\nlet attempts = 0;\nconst policy = definePolicy({ fallback: { value: 'policy-recovered' }, retry: { attempts: 2, idempotent: true } });\nconst protectedMethod = pipe(function () { attempts += 1; throw new Error('upstream unavailable'); }, policy.operator());\nconst result = await run({}, [], protectedMethod);\nif (result !== 'policy-recovered' || attempts !== 2) throw new Error('Policy ESM fallback/retry composition is unavailable');\n",
  );
  writeFileSync(
    policyCjsSmoke,
    "const { definePolicy, InvalidPolicyError } = require('annotations-design-patterns/policy');\nconst { PolicyError, isPolicyError } = require('annotations-design-patterns/operators');\nconst { pipe } = require('annotations-design-patterns/pipe');\nconst { run } = require('annotations-design-patterns/run');\nasync function main() {\n  const invalidPolicyError = new InvalidPolicyError('retry.attempts', 'must be positive');\n  if (!(invalidPolicyError instanceof PolicyError) || !isPolicyError(invalidPolicyError)) throw new Error('Policy CJS errors must cross public subpaths');\n  let attempts = 0;\n  const policy = definePolicy({ fallback: { value: 'policy-recovered' }, retry: { attempts: 2, idempotent: true } });\n  const protectedMethod = pipe(function () { attempts += 1; throw new Error('upstream unavailable'); }, policy.operator());\n  const result = await run({}, [], protectedMethod);\n  if (result !== 'policy-recovered' || attempts !== 2) throw new Error('Policy CJS fallback/retry composition is unavailable');\n}\nmain().catch((error) => { console.error(error); process.exitCode = 1; });\n",
  );
  writeFileSync(
    policyTypeSmoke,
    "import { definePolicy, type PolicyConfig } from 'annotations-design-patterns/policy';\nimport { pipe } from 'annotations-design-patterns/pipe';\nimport { run } from 'annotations-design-patterns/run';\ntype Receiver = { readonly prefix: string };\ntype Args = readonly [id: string];\nconst receiver: Receiver = { prefix: 'api' };\nconst config: PolicyConfig<Args, string, Receiver> = { fallback: { value: 'policy-recovered' }, retry: { attempts: 2, idempotent: true } };\nconst policy = definePolicy(config);\nconst method = function (this: Receiver, id: string): string { return `${this.prefix}:${id}`; };\nconst result = run(receiver, ['account'] as const, pipe(method, policy.operator()));\nvoid result;\n",
  );
  writeFileSync(
    experimentalEsmSmoke,
    "import { hedge, switchOverlap } from 'annotations-design-patterns/experimental';\nimport { pipe } from 'annotations-design-patterns/pipe';\nconst operation = pipe(function () { return Promise.resolve('experimental'); }, hedge({ delayMs: 1, idempotent: true }));\nconst switched = pipe(function (value) { return Promise.resolve(value); }, switchOverlap({ key: () => 'experimental' }));\nif (await operation.call({}) !== 'experimental' || await switched.call({}, 'switch') !== 'switch') throw new Error('Experimental ESM exports are unavailable');\n",
  );
  writeFileSync(
    experimentalCjsSmoke,
    "const { hedge, switchOverlap } = require('annotations-design-patterns/experimental');\nconst { pipe } = require('annotations-design-patterns/pipe');\nasync function main() { const operation = pipe(function () { return Promise.resolve('experimental'); }, hedge({ delayMs: 1, idempotent: true })); const switched = pipe(function (value) { return Promise.resolve(value); }, switchOverlap({ key: () => 'experimental' })); if (await operation.call({}) !== 'experimental' || await switched.call({}, 'switch') !== 'switch') throw new Error('Experimental CJS exports are unavailable'); }\nmain().catch((error) => { console.error(error); process.exitCode = 1; });\n",
  );
  writeFileSync(
    experimentalTypeSmoke,
    "import { hedge, switchOverlap, type HedgeOptions, type SwitchOverlapOptions } from 'annotations-design-patterns/experimental';\nimport { pipe } from 'annotations-design-patterns/pipe';\nconst options: HedgeOptions = { delayMs: 1, idempotent: true };\nconst switchOptions: SwitchOverlapOptions<object, readonly [value: string]> = { key: ({ args }) => args[0] };\nconst operation = pipe(function (value: string): Promise<string> { return Promise.resolve(value); }, hedge<object, readonly [value: string], string>(options));\nconst switched = pipe(function (value: string): Promise<string> { return Promise.resolve(value); }, switchOverlap<object, readonly [value: string], string>(switchOptions));\nvoid operation;\nvoid switched;\n",
  );

  run(process.execPath, [esmSmoke], consumerDirectory);
  run(process.execPath, [cjsSmoke], consumerDirectory);
  run(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--noEmit',
      '--target',
      'ES2022',
      typeSmoke,
    ],
    consumerDirectory,
  );
  run(process.execPath, [policyEsmSmoke], consumerDirectory);
  run(process.execPath, [policyCjsSmoke], consumerDirectory);
  run(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--noEmit',
      '--target',
      'ES2022',
      policyTypeSmoke,
    ],
    consumerDirectory,
  );
  run(process.execPath, [experimentalEsmSmoke], consumerDirectory);
  run(process.execPath, [experimentalCjsSmoke], consumerDirectory);
  run(
    process.execPath,
    [
      resolve(repositoryRoot, 'node_modules/typescript/bin/tsc'),
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--noEmit',
      '--target',
      'ES2022',
      experimentalTypeSmoke,
    ],
    consumerDirectory,
  );

  console.log('packed consumer smoke ESM/CJS/types OK');
} finally {
  if (existsSync(temporaryDirectory)) {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}
