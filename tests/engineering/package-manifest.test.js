import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { validateRuntimeDependencies } from '../../scripts/verify-package.mjs';

describe('runtime dependency publication contract', () => {
  it('accepts the zero-dependency package', () => {
    expect(() => validateRuntimeDependencies({ name: 'library' })).not.toThrow();
    expect(() => validateRuntimeDependencies({ name: 'library', dependencies: {} })).not.toThrow();
  });

  it('rejects a self-dependency with a specific diagnostic', () => {
    expect(() =>
      validateRuntimeDependencies({ name: 'library', dependencies: { library: '^1.0.0' } }),
    ).toThrow('must not depend on itself');
  });

  it('rejects runtime dependencies that contradict the package contract', () => {
    expect(() =>
      validateRuntimeDependencies({ name: 'library', dependencies: { other: '^1.0.0' } }),
    ).toThrow('zero runtime dependencies');
    expect(() =>
      validateRuntimeDependencies({ name: 'library', optionalDependencies: { other: '^1.0.0' } }),
    ).toThrow('zero runtime dependencies');
  });

  it('keeps the current manifest and lockfile free of runtime dependencies', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const lock = JSON.parse(
      readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'),
    );
    expect(() => validateRuntimeDependencies(manifest)).not.toThrow();
    expect(() => validateRuntimeDependencies(lock.packages[''])).not.toThrow();
    expect(lock.packages['node_modules/' + manifest.name]).toBeUndefined();
  });
});
