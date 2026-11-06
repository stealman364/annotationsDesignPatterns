import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const anyPattern = /\bany\b/g;

function collectFiles(directory, predicate) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(path, predicate);
    }

    return predicate(path) ? [path] : [];
  });
}

function findOccurrences(files) {
  return files.flatMap((path) => {
    const contents = readFileSync(path, 'utf8');
    return contents.split(/\r?\n/).flatMap((line, index) => {
      const count = [...line.matchAll(anyPattern)].length;
      return count === 0
        ? []
        : [{ count, line: index + 1, path: relative(repositoryRoot, path).replaceAll('\\', '/') }];
    });
  });
}

function report(label, occurrences) {
  const total = occurrences.reduce((sum, occurrence) => sum + occurrence.count, 0);
  console.log(`${label}: ${total} occurrence(s) in ${occurrences.length} line(s)`);
  for (const { count, line, path } of occurrences) {
    console.log(`  ${path}:${line} (${count})`);
  }
}

/** Compare per-file counts without rewriting or transferring existing budgets. */
export function checkBudget(occurrences, baseline) {
  const counts = new Map();
  for (const { path, count } of occurrences) {
    counts.set(path, (counts.get(path) ?? 0) + count);
  }
  return [...counts].flatMap(([path, count]) => {
    const budget = Object.hasOwn(baseline, path) ? baseline[path] : 0;
    if (!Number.isSafeInteger(budget) || budget < 0) {
      throw new Error(`Invalid any baseline budget for ${path}`);
    }
    return count > budget ? [{ path, count, budget }] : [];
  });
}

function audit() {
  const baseline = JSON.parse(
    readFileSync(new URL('./any-baseline.json', import.meta.url), 'utf8'),
  );
  const sourceFiles = collectFiles(resolve(repositoryRoot, 'src'), (path) => path.endsWith('.ts'));
  const declarationFiles = collectFiles(
    resolve(repositoryRoot, 'dist'),
    (path) => path.endsWith('.d.ts') || path.endsWith('.d.cts'),
  );

  if (declarationFiles.length === 0) {
    throw new Error('No generated declaration files found. Run the build before auditing D1.');
  }

  const sourceOccurrences = findOccurrences(sourceFiles);
  const declarationOccurrences = findOccurrences(declarationFiles);
  report('D1 source any audit', sourceOccurrences);
  report('D1 declaration any audit', declarationOccurrences);
  const violations = [
    ...checkBudget(sourceOccurrences, baseline.source),
    ...checkBudget(declarationOccurrences, baseline.declarations),
  ];
  if (violations.length > 0) {
    for (const { path, count, budget } of violations) {
      console.error(`Any budget exceeded: ${path}: ${count} occurrence(s), budget ${budget}`);
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  audit();
}
