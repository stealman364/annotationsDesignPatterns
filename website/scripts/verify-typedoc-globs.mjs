import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from '../node_modules/typedoc/dist/node-utils.js';

const project = fileURLToPath(new URL('..', import.meta.url));
const validation = resolve(project, '.validation');
mkdirSync(validation, { recursive: true });
const fixture = mkdtempSync(join(validation, 'glob-fixture-'));
const baselinePath = resolve(project, 'scripts/fixtures/typedoc-globs.json');
const files = [
  'root.ts',
  'readme.md',
  'src/a/index.ts',
  'src/a/deep/item.ts',
  'src/b/index.ts',
  'src/b/view.tsx',
  'src/.hidden/private.ts',
  'src/node_modules/dep/index.ts',
  'other/index.ts',
];
for (const file of files) {
  const target = join(fixture, file);
  mkdirSync(resolve(target, '..'), { recursive: true });
  writeFileSync(target, '// Static glob compatibility fixture.\n');
}
const patterns = [
  '**/*.ts',
  'src/**/*.ts',
  'src/**/index.ts',
  'src/*.{ts,tsx}',
  'src/{a,b}/**/*.ts',
  'src/**',
  'src/**/',
  '**/.hidden/*.ts',
  '**/node_modules/**/*.ts',
  '!src/**/*.ts',
  'src/../*.ts',
  'src/*(a|b)/*.ts',
  'src/{a,b}/index.ts',
];
const root = fixture.replaceAll('\\', '/');
const cases = patterns.flatMap((pattern) =>
  [false, true].map((includeDirectories) => {
    const negated = pattern.startsWith('!');
    const absolute = `${negated ? '!' : ''}${root}/${negated ? pattern.slice(1) : pattern}`;
    const paths = glob(absolute, root, { includeDirectories })
      .map((path) => relative(fixture, path).replaceAll('\\', '/'))
      .sort();
    return { pattern, includeDirectories, paths };
  }),
);
if (process.argv.includes('--record-baseline')) {
  const require = createRequire(new URL('../node_modules/typedoc/package.json', import.meta.url));
  assert.equal(
    require('minimatch/package.json').version,
    '10.2.6',
    'Record the baseline only from the original dependency.',
  );
  mkdirSync(resolve(baselinePath, '..'), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify({ cases }, null, 2)}\n`);
  console.log(`Recorded ${cases.length} glob cases. Review before accepting a new baseline.`);
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  assert.deepEqual(
    cases,
    baseline.cases,
    'TypeDoc glob traversal changed from the original baseline.',
  );
  console.log(`TypeDoc glob compatibility OK (${cases.length} cases).`);
}
