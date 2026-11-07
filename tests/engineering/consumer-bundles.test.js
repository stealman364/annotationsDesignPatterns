import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/consumer-bundles.mjs');
const caseNames = ['builder', 'decorator', 'memoize', 'policy', 'retry-pipeline', 'semaphore'];

function makePackageFixture() {
  const root = mkdtempSync(join(tmpdir(), 'consumer-bundles-package-'));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'consumer-bundle-fixture',
      version: '1.0.0',
      type: 'module',
      exports: {
        '.': { import: { default: './index.js' } },
        './operators': { import: { default: './operators.js' } },
        './pipe': { import: { default: './pipe.js' } },
        './policy': { import: { default: './policy.js' } },
      },
    }),
  );
  writeFileSync(
    join(root, 'index.js'),
    `export function builderFor(C) { const values = {}; let proxy; proxy = new Proxy({}, { get(_target, key) { if (key === 'build') return () => Object.assign(new C(), values); return value => { values[key.slice(4).toLowerCase()] = value; return proxy; }; } }); return proxy; }
export function Decorate(wrapper) { return method => wrapper(method); }`,
  );
  writeFileSync(
    join(root, 'operators.js'),
    `export function retry() { return method => (...args) => { try { return method(...args); } catch { return method(...args); } }; }
export function memoize() { return method => { let hasValue = false, value; return (...args) => hasValue ? value : (hasValue = true, value = method(...args)); }; }
export function semaphore() { return method => async (...args) => method(...args); }`,
  );
  writeFileSync(
    join(root, 'pipe.js'),
    'export function pipe(method, ...operators) { return operators.reduce((current, operator) => operator(current), method); }',
  );
  writeFileSync(
    join(root, 'policy.js'),
    'export function definePolicy() { return { operator: () => ({ apply: method => method }) }; }',
  );
  return root;
}

function removeFixture(root) {
  const absoluteRoot = resolve(root);
  const tempRoot = resolve(tmpdir());
  if (!absoluteRoot.startsWith(`${tempRoot}${sep}`)) {
    throw new Error(`Refusing to remove non-temporary fixture path: ${absoluteRoot}`);
  }
  rmSync(absoluteRoot, { recursive: true, force: true });
}

describe('consumer bundle measurements', () => {
  it('bundles package-export consumers and reports raw and gzip sizes', () => {
    const root = makePackageFixture();
    try {
      const result = execFileSync(process.execPath, [script, '--root', root], {
        encoding: 'utf8',
      });
      const report = JSON.parse(result);

      expect(Object.keys(report.cases).sort()).toEqual(caseNames);
      expect(report.packageVersion).toBe('1.0.0');
      for (const measurement of Object.values(report.cases)) {
        expect(measurement.bytes).toBeGreaterThan(0);
        expect(measurement.gzip).toBeGreaterThan(0);
        expect(measurement.gzip).toBeLessThan(measurement.bytes);
      }
    } finally {
      removeFixture(root);
    }
  });

  it('exits unsuccessfully when an explicit consumer budget is too small', () => {
    const directory = mkdtempSync(join(tmpdir(), 'consumer-bundles-budget-'));
    const root = makePackageFixture();
    const budgets = join(directory, 'tiny.json');
    writeFileSync(
      budgets,
      JSON.stringify({
        cases: Object.fromEntries(caseNames.map((name) => [name, { bytes: 1, gzip: 1 }])),
      }),
    );

    try {
      const result = spawnSync(process.execPath, [script, '--root', root, '--budgets', budgets], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout).violations.length).toBeGreaterThan(0);
    } finally {
      removeFixture(directory);
      removeFixture(root);
    }
  });

  it('writes JSON to an explicitly requested output path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'consumer-bundles-output-'));
    const root = makePackageFixture();
    const output = join(directory, 'nested', 'report.json');

    try {
      execFileSync(process.execPath, [script, '--root', root, '--output', output], {
        encoding: 'utf8',
      });
      expect(existsSync(output)).toBe(true);
      expect(JSON.parse(readFileSync(output, 'utf8')).cases.builder.bytes).toBeGreaterThan(0);
    } finally {
      removeFixture(directory);
      removeFixture(root);
    }
  });

  it('rejects malformed numeric limits instead of treating them as unlimited', () => {
    const directory = mkdtempSync(join(tmpdir(), 'consumer-bundles-malformed-'));
    const root = makePackageFixture();
    const budgets = join(directory, 'malformed.json');
    writeFileSync(budgets, JSON.stringify({ cases: { builder: { bytes: 1000 } } }));

    try {
      const result = spawnSync(process.execPath, [script, '--root', root, '--budgets', budgets], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Invalid gzip budget for builder');
    } finally {
      removeFixture(directory);
      removeFixture(root);
    }
  });

  it('explains invalid command line options', () => {
    const result = spawnSync(process.execPath, [script, '--unknown'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown option --unknown');
    expect(result.stderr).toContain('--help');
  });
});
