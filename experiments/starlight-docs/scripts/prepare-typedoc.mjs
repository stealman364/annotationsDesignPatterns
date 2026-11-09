import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Private trial compatibility patch, not an upstream-supported dependency combination.
// TypeDoc's old per-row recursion ignores negation. Keep that behavior with a
// separate public matcher; the ordinary file matcher must still apply negation.
const require = createRequire(new URL('../package.json', import.meta.url));
const manifestPath = require.resolve('typedoc/package.json');
const project = fileURLToPath(new URL('..', import.meta.url));
assert.equal(
  manifestPath,
  join(project, 'node_modules/typedoc/package.json'),
  'TypeDoc must be installed inside this trial.',
);
const typedoc = JSON.parse(readFileSync(manifestPath, 'utf8'));
const fromTypeDoc = createRequire(manifestPath);
assert.equal(typedoc.version, '0.28.20', 'Review the compatibility patch after a TypeDoc upgrade.');
assert.equal(fromTypeDoc('minimatch/package.json').version, '11.0.5');
const target = join(dirname(manifestPath), 'dist/node-utils.js');
const source = readFileSync(target, 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const originalHash = '44982772d80190c9065e29081826b9586c2f65ab71a8d4dd0bbfdeecfecd9ebc';
const patchedHash = '2eba941168420daca6cd489a8a9e3a24c9a3f3382c6a767a19361d17f6b0c34f';

if (hash(source) === patchedHash) {
  console.log('TypeDoc compatibility patch already present.');
} else {
  assert.equal(hash(source), originalHash, 'Unexpected TypeDoc source: refusing to patch it.');
  const original = `      return mini.set.some((row) => mini.matchOne(
        childPath,
        row,
        /* partial */
        true
      ));`;
  const patched = source
    .replace(
      '  const mini = new Minimatch2(pattern);',
      '  const mini = new Minimatch2(pattern);\n  const directoryMatcher = new Minimatch2(pattern, { flipNegate: true });',
    )
    .replace(original, '      return directoryMatcher.match(childPath.join("/"), true);');
  assert.equal(hash(patched), patchedHash, 'Patch output differs from the reviewed source.');
  writeFileSync(target, patched);
  console.log('Applied private TypeDoc/minimatch compatibility patch.');
}
