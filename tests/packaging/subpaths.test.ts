import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly exports: Record<string, unknown>;
}

function readPackageManifest(): PackageManifest {
  const packagePath = resolve('package.json');
  return JSON.parse(readFileSync(packagePath, 'utf8')) as PackageManifest;
}

describe('package subpaths', () => {
  it('exposes only explicit public facades and bounded legacy pattern subpaths', () => {
    const packageManifest = readPackageManifest();

    expect(Object.keys(packageManifest.exports).sort()).toEqual([
      '.',
      './behavioral/*',
      './creational/*',
      './decorators',
      './experimental',
      './node',
      './observability',
      './operators',
      './pipe',
      './policy',
      './run',
      './store',
      './structural/*',
      './utility/*',
    ]);
    expect(packageManifest.exports).not.toHaveProperty('./*');
    expect(packageManifest.exports).not.toHaveProperty('./core');
    expect(packageManifest.exports).not.toHaveProperty('./operators/*');
  });
});
