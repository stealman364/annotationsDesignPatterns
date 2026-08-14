import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../../src/index';

const phaseTwoArchitectureDocument = resolve('docs/architecture/phase-2-core.md');

describe('phase 2 architecture boundaries', () => {
  it('documents the allowed inward dependency graph', () => {
    expect(existsSync(phaseTwoArchitectureDocument)).toBe(true);

    const document = readFileSync(phaseTwoArchitectureDocument, 'utf8');

    expect(document).toContain('core → operators → patterns');
    expect(document).toMatch(/core` must not import patterns/);
    expect(document).toMatch(/operators may import only core/);
  });

  it('does not expose internal core or operators from the public root', () => {
    expect(publicApi).not.toHaveProperty('core');
    expect(publicApi).not.toHaveProperty('operators');
  });
});
