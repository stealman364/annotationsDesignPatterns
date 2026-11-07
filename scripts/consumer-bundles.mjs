import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { build, version as esbuildVersion } from 'esbuild';

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = resolve(dirname(scriptPath), '..');
const consumerExamples = (packageName) => ({
  builder: `import { builderFor } from '${packageName}';
class User { name = ''; }
console.log(builderFor(User).withName('Ada').build().name);`,
  'retry-pipeline': `import { retry } from '${packageName}/operators';
import { pipe } from '${packageName}/pipe';
let attempts = 0;
const load = pipe(() => { attempts += 1; if (attempts < 2) throw new Error('retry'); return 'ok'; }, retry({ attempts: 2 }));
 (async () => console.log(await load()))();`,
  memoize: `import { memoize } from '${packageName}/operators';
import { pipe } from '${packageName}/pipe';
const cached = pipe(() => 'ok', memoize());
console.log(cached());`,
  semaphore: `import { semaphore } from '${packageName}/operators';
import { pipe } from '${packageName}/pipe';
const limited = pipe(() => 'ok', semaphore({ permits: 2 }));
 (async () => console.log(await limited()))();`,
  policy: `import { definePolicy } from '${packageName}/policy';
const policy = definePolicy({ retry: { attempts: 2, idempotent: true } });
const protectedCall = policy.operator().apply(() => 'ok');
console.log(protectedCall());`,
  decorator: `import { Decorate } from '${packageName}';
class Calculator { @Decorate((original) => function (...args) { return original.apply(this, args) }) add(a, b) { return a + b; } }
console.log(new Calculator().add(2, 3));`,
});

function exportedTarget(manifest, subpath, packageRoot) {
  const entry = manifest.exports[subpath];
  if (!entry) throw new Error(`Package does not export ${subpath}`);
  const conditions = entry.import ?? entry;
  const target = conditions.default ?? conditions;
  if (typeof target !== 'string' || !target.startsWith('./')) {
    throw new Error(`No ESM target is declared for ${subpath}`);
  }
  return resolve(packageRoot, target);
}

function parseArgs(args) {
  const options = {
    output: undefined,
    budgets: resolve(dirname(scriptPath), 'consumer-budgets.json'),
    root: defaultRoot,
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument !== '--output' && argument !== '--budgets' && argument !== '--root') {
      throw new Error(`Unknown option ${argument}. Use --help for usage.`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path.`);
    const key = { '--output': 'output', '--budgets': 'budgets', '--root': 'root' }[argument];
    options[key] = resolve(value);
    index += 1;
  }
  return options;
}

export async function measureConsumers(packageRoot = defaultRoot) {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
  const packageName = manifest.name;
  const examples = consumerExamples(packageName);
  const aliases = new Map([
    [packageName, exportedTarget(manifest, '.', packageRoot)],
    [`${packageName}/operators`, exportedTarget(manifest, './operators', packageRoot)],
    [`${packageName}/pipe`, exportedTarget(manifest, './pipe', packageRoot)],
    [`${packageName}/policy`, exportedTarget(manifest, './policy', packageRoot)],
  ]);
  const results = {};
  for (const [name, source] of Object.entries(examples)) {
    const result = await build({
      stdin: {
        contents: source,
        resolveDir: process.cwd(),
        sourcefile: `${name}.js`,
        loader: 'js',
      },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2022',
      minify: true,
      treeShaking: true,
      write: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'published-package-exports',
          setup(buildApi) {
            buildApi.onResolve(
              {
                filter: /.*/,
              },
              (args) => {
                if (args.path !== packageName && !args.path.startsWith(`${packageName}/`)) {
                  return null;
                }
                const target = aliases.get(args.path);
                if (!target)
                  throw new Error(`Consumer imports unsupported package subpath ${args.path}`);
                return { path: target };
              },
            );
          },
        },
      ],
    });
    const bytes = result.outputFiles.reduce((size, file) => size + file.contents.length, 0);
    const contents = Buffer.concat(result.outputFiles.map((file) => Buffer.from(file.contents)));
    const output = [];
    await runInNewContext(contents.toString('utf8'), {
      console: { log: (...values) => output.push(values) },
    });
    const expected = {
      builder: 'Ada',
      'retry-pipeline': 'ok',
      memoize: 'ok',
      semaphore: 'ok',
      policy: 'ok',
      decorator: 5,
    }[name];
    if (output.length !== 1 || output[0][0] !== expected) {
      throw new Error(
        `Consumer example ${name} produced ${JSON.stringify(output)}; expected ${JSON.stringify(expected)}`,
      );
    }
    results[name] = { bytes, gzip: gzipSync(contents, { level: 9 }).length };
  }
  return results;
}

export async function run(args = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(
      `${error.message}\nUsage: node scripts/consumer-bundles.mjs [--root package-dir] [--budgets path] [--output path]`,
    );
    return 2;
  }
  if (options.help) {
    console.log(
      'Usage: node scripts/consumer-bundles.mjs [--root package-dir] [--budgets path] [--output path]\nMeasure six minified, tree-shaken browser ESM consumers and enforce raw/gzip byte budgets.',
    );
    return 0;
  }

  try {
    const cases = await measureConsumers(options.root);
    const manifest = JSON.parse(readFileSync(resolve(options.root, 'package.json'), 'utf8'));
    const budgetData = JSON.parse(readFileSync(options.budgets, 'utf8'));
    for (const [name, budget] of Object.entries(budgetData.cases ?? {})) {
      for (const key of ['bytes', 'gzip']) {
        if (!Number.isSafeInteger(budget?.[key]) || budget[key] < 0) {
          throw new Error(
            `Invalid ${key} budget for ${name}; expected a non-negative safe integer`,
          );
        }
      }
    }
    const violations = [];
    for (const [name, measurement] of Object.entries(cases)) {
      const budget = budgetData.cases?.[name];
      if (!budget || measurement.bytes > budget.bytes || measurement.gzip > budget.gzip) {
        violations.push({ name, ...measurement, budget: budget ?? null });
      }
    }
    for (const name of Object.keys(budgetData.cases ?? {})) {
      if (!(name in cases)) violations.push({ name, error: 'Budgeted consumer case is missing' });
    }
    const report = {
      packageVersion: manifest.version,
      esbuildVersion,
      measurement:
        'Package ESM exports; minified browser ESM, esbuild target ES2022, tree shaking enabled; gzip level 9.',
      cases,
      violations,
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (options.output) {
      mkdirSync(dirname(options.output), { recursive: true });
      writeFileSync(options.output, json);
    } else {
      process.stdout.write(json);
    }
    return violations.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  process.exitCode = await run();
}
