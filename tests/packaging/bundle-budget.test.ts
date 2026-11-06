import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('distribution entrypoint budget', () => {
  it('counts imported chunks and rejects growth against an explicitly recorded budget', () => {
    const root = mkdtempSync(join(tmpdir(), 'annotations-budget-'));
    const script = resolve('scripts/bundle-budget.mjs');
    try {
      mkdirSync(join(root, 'dist'));
      mkdirSync(join(root, 'scripts'));
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          exports: {
            '.': {
              import: { default: './dist/index.js' },
              require: { default: './dist/index.cjs' },
            },
          },
        }),
      );
      writeFileSync(join(root, 'dist/index.js'), "export { value } from './chunk.js';");
      writeFileSync(join(root, 'dist/chunk.js'), 'export const value = 1;');
      writeFileSync(join(root, 'dist/index.cjs'), 'exports.value = 1;');
      const run = (...args: string[]) =>
        execFileSync(process.execPath, [script, '--root', root, ...args], {
          stdio: 'pipe',
          encoding: 'utf8',
        });
      expect(run('--write')).toContain('2 entrypoints');
      expect(JSON.parse(run('--report'))['dist/index.js'].raw).toBeGreaterThan(20);
      expect(run()).toContain('budgets OK');
      writeFileSync(join(root, 'dist/chunk.js'), `export const value = '${'more'.repeat(1_000)}';`);
      expect(() => run()).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
