import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/check-typescript-compat.mjs', import.meta.url));

describe('TypeScript compatibility checker', () => {
  it('documents its compiler and tarball options', () => {
    const result = spawnSync(execPath, [script, '--help'], { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/--compiler installed\|5\.0\.4\|all/);
    expect(result.stdout).toMatch(/installed uses repository TypeScript/);
    expect(result.stdout).toMatch(/--tarball <path>/);
  });

  it('rejects unsupported compiler selections', () => {
    const result = spawnSync(execPath, [script, '--compiler', 'latest'], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--compiler must be installed, 5\.0\.4, or all/);
  });
});
