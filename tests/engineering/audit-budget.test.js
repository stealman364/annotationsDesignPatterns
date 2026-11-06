import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { URL } from 'node:url';
import { checkBudget } from '../../scripts/audit-any.mjs';

describe('controlled any debt budget', () => {
  const baseline = { 'src/legacy.ts': 2, 'src/other.ts': 1 };

  it('accepts the original debt without requiring line numbers to remain fixed', () => {
    expect(
      checkBudget(
        [
          { path: 'src/legacy.ts', count: 1, line: 30 },
          { path: 'src/legacy.ts', count: 1, line: 50 },
          { path: 'src/other.ts', count: 1, line: 2 },
        ],
        baseline,
      ),
    ).toEqual([]);
  });

  it('accepts reductions and deleted debt files', () => {
    expect(checkBudget([{ path: 'src/legacy.ts', count: 1, line: 1 }], baseline)).toEqual([]);
    expect(checkBudget([], baseline)).toEqual([]);
  });

  it('rejects increases within a previously budgeted file', () => {
    expect(checkBudget([{ path: 'src/legacy.ts', count: 3, line: 1 }], baseline)).toEqual([
      { path: 'src/legacy.ts', count: 3, budget: 2 },
    ]);
  });

  it('rejects newly introduced debt rather than rebasing it automatically', () => {
    expect(checkBudget([{ path: 'src/new.ts', count: 1, line: 1 }], baseline)).toEqual([
      { path: 'src/new.ts', count: 1, budget: 0 },
    ]);
    expect(baseline).toEqual({ 'src/legacy.ts': 2, 'src/other.ts': 1 });
  });

  it('rejects debt moved across files even if the overall total is unchanged', () => {
    expect(checkBudget([{ path: 'src/other.ts', count: 3, line: 1 }], baseline)).toEqual([
      { path: 'src/other.ts', count: 3, budget: 1 },
    ]);
  });

  it('exits nonzero for new source or declaration debt in an isolated package fixture', () => {
    const prefix = join(tmpdir(), 'adp-any-audit-');
    const fixtureRoot = mkdtempSync(prefix);
    try {
      for (const directory of ['scripts', 'src', 'dist']) {
        mkdirSync(join(fixtureRoot, directory));
      }
      for (const filename of ['audit-any.mjs', 'any-baseline.json']) {
        copyFileSync(
          new URL(`../../scripts/${filename}`, import.meta.url),
          join(fixtureRoot, 'scripts', filename),
        );
      }
      const sourceFile = join(fixtureRoot, 'src', 'new.ts');
      const declarationFile = join(fixtureRoot, 'dist', 'new.d.ts');
      writeFileSync(sourceFile, 'export type Value = string;');
      writeFileSync(declarationFile, 'export type Value = string;');
      const runAudit = () =>
        spawnSync(execPath, [join(fixtureRoot, 'scripts', 'audit-any.mjs')], {
          encoding: 'utf8',
        });
      expect(runAudit().status).toBe(0);
      writeFileSync(sourceFile, 'export type Value = any;');
      const sourceFailure = runAudit();
      expect(sourceFailure.status).toBe(1);
      expect(sourceFailure.stderr).toContain('src/new.ts: 1 occurrence(s), budget 0');
      writeFileSync(sourceFile, 'export type Value = string;');
      writeFileSync(declarationFile, 'export type Value = any;');
      const declarationFailure = runAudit();
      expect(declarationFailure.status).toBe(1);
      expect(declarationFailure.stderr).toContain('dist/new.d.ts: 1 occurrence(s), budget 0');
    } finally {
      // Verify the absolute temporary target before recursive cleanup.
      expect(resolve(fixtureRoot).startsWith(resolve(prefix))).toBe(true);
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
