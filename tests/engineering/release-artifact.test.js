import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { env, execPath } from 'node:process';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');
const step = workflow
  .split('      - name: Create and validate release tarball\n')[1]
  .split('      - name: Check supported TypeScript versions')[0];
const script = step
  .split("node --input-type=module <<'NODE'\n")[1]
  .split('\n          NODE')[0]
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

function fixture(prefix, run) {
  const root = mkdtempSync(join(tmpdir(), 'annotations-release-test-'));
  if (
    dirname(root) !== resolve(tmpdir()) ||
    !basename(root).startsWith('annotations-release-test-')
  ) {
    throw new Error('Unexpected test directory');
  }
  try {
    mkdirSync(join(root, 'release-artifact'));
    mkdirSync(join(root, 'quality'));
    mkdirSync(join(root, 'package'));
    const identity = { name: 'annotations-design-patterns', version: '2.3.0-rc.1' };
    const manifest = JSON.stringify(identity);
    writeFileSync(join(root, 'package.json'), manifest);
    writeFileSync(join(root, 'package/package.json'), manifest);
    const filename = `${identity.name}-${identity.version}.tgz`;
    const archive = join(root, 'release-artifact', filename);
    execFileSync('tar', ['-czf', `release-artifact/${filename}`, 'package/package.json'], {
      cwd: root,
    });
    const integrity =
      'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64');
    const pack = { ...identity, filename, integrity };
    writeFileSync(
      join(root, 'release-artifact/pack.json'),
      prefix + JSON.stringify([pack], null, 2),
    );
    const execute = (overrides = {}) =>
      spawnSync(execPath, ['--input-type=module'], {
        input: script,
        cwd: root,
        encoding: 'utf8',
        env: {
          ...env,
          EXPECTED_NAME: identity.name,
          EXPECTED_VERSION: identity.version,
          SOURCE_COMMIT: 'fixture-commit',
          ...overrides,
        },
      });
    run({ root, execute, pack, archive });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('actual release workflow artifact validation', () => {
  it.each(['', 'sync hooks: pre-push, pre-commit, commit-msg\n'])(
    'validates the archive despite lifecycle output %j',
    (prefix) => {
      fixture(prefix, ({ root, execute, pack, archive }) => {
        const result = execute();
        expect(result.status, result.stderr).toBe(0);
        const manifest = JSON.parse(
          readFileSync(join(root, 'release-artifact/manifest.json'), 'utf8'),
        );
        expect(manifest).toMatchObject({
          filename: pack.filename,
          integrity: pack.integrity,
          sourceCommit: 'fixture-commit',
        });
        expect(manifest.sha256).toBe(
          createHash('sha256').update(readFileSync(archive)).digest('hex'),
        );
        expect(JSON.parse(readFileSync(join(root, 'release-artifact/pack.json'), 'utf8'))).toEqual([
          pack,
        ]);
      });
    },
  );

  it('rejects a version mismatch before accepting the artifact', () => {
    fixture('', ({ execute }) => {
      const result = execute({ EXPECTED_VERSION: '9.9.9' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Unexpected package identity');
    });
  });
});
