import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../../src/index';

// Allowed dependency graph: core → operators → patterns.
const sourceRoot = resolve('src');

function relativeImportsOf(layer: string): { file: string; specifier: string }[] {
  const layerDir = join(sourceRoot, layer);
  const files = readdirSync(layerDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('.ts'),
  );

  return files.flatMap((file) => {
    const source = readFileSync(join(layerDir, file), 'utf8');
    return [...source.matchAll(/from '(\.[^']+)'/g)].map((match) => ({
      file: `${layer}/${file}`,
      specifier: match[1]!,
    }));
  });
}

describe('phase 2 architecture boundaries', () => {
  it('core does not import any other layer', () => {
    const outward = relativeImportsOf('core').filter(({ specifier }) =>
      specifier.startsWith('../'),
    );

    expect(outward).toEqual([]);
  });

  it('operators may import only core', () => {
    const outward = relativeImportsOf('operators').filter(
      ({ specifier }) => specifier.startsWith('../') && !specifier.startsWith('../core/'),
    );

    expect(outward).toEqual([]);
  });

  it('does not expose internal core or operators from the public root', () => {
    expect(publicApi).not.toHaveProperty('core');
    expect(publicApi).not.toHaveProperty('operators');
  });
});
