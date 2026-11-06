import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

const rootIndex = process.argv.indexOf('--root');
const root =
  rootIndex === -1
    ? resolve(fileURLToPath(new URL('..', import.meta.url)))
    : resolve(process.argv[rootIndex + 1]);
const dist = resolve(root, 'dist');
const budgetPath = resolve(root, 'scripts/bundle-budget.json');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function footprint(entry) {
  const files = new Map();
  function visit(path) {
    if (!path.startsWith(dist + sep)) throw new Error(`Import escapes dist: ${path}`);
    if (files.has(path)) return;
    const source = readFileSync(path, 'utf8');
    files.set(path, source);
    const references = /(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(references)) visit(resolve(dirname(path), match[1]));
  }
  visit(entry);
  const contents = Buffer.from(
    [...files]
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([, source]) => source)
      .join('\n'),
  );
  return { raw: contents.length, gzip: gzipSync(contents, { level: 9 }).length };
}

const measurements = {};
for (const [subpath, conditions] of Object.entries(manifest.exports)) {
  for (const format of ['import', 'require']) {
    const target = conditions[format].default;
    const entries = target.includes('*')
      ? readdirSync(resolve(root, dirname(target)))
          .filter((file) => file.endsWith(target.slice(target.indexOf('*') + 1)))
          .map((file) => resolve(root, dirname(target), file))
      : [resolve(root, target)];
    for (const entry of entries) {
      const name = relative(root, entry).replaceAll('\\', '/');
      measurements[name] = footprint(entry);
    }
    if (entries.length === 0) throw new Error(`Missing entrypoint ${subpath} (${format})`);
  }
}

if (process.argv.includes('--report')) {
  console.log(JSON.stringify(measurements, null, 2));
} else if (process.argv.includes('--write')) {
  const entries = Object.fromEntries(
    Object.entries(measurements)
      .sort()
      .map(([name, sizes]) => [
        name,
        {
          raw: Math.ceil((sizes.raw * 1.05) / 128) * 128,
          gzip: Math.ceil((sizes.gzip * 1.05) / 64) * 64,
        },
      ]),
  );
  writeFileSync(
    budgetPath,
    JSON.stringify(
      {
        measurement:
          'Reachable distribution modules per public entrypoint, raw and gzip level 9; not a consumer tree-shaken bundle.',
        entries,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Wrote reviewed baseline for ${Object.keys(entries).length} entrypoints`);
} else {
  if (!existsSync(budgetPath))
    throw new Error('Missing reviewed bundle budget; run --write explicitly after review');
  const { entries } = JSON.parse(readFileSync(budgetPath, 'utf8'));
  for (const [name, sizes] of Object.entries(measurements)) {
    const limit = entries[name];
    if (limit === undefined || sizes.raw > limit.raw || sizes.gzip > limit.gzip) {
      throw new Error(
        `Entrypoint budget exceeded: ${name} raw=${sizes.raw} gzip=${sizes.gzip}; budget=${JSON.stringify(limit)}`,
      );
    }
  }
  for (const name of Object.keys(entries)) {
    if (measurements[name] === undefined)
      throw new Error(`Budgeted entrypoint disappeared: ${name}`);
  }
  console.log(`Entrypoint budgets OK (${Object.keys(measurements).length} ESM/CJS entrypoints)`);
}
