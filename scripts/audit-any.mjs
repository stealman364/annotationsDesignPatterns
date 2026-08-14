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

const sourceFiles = collectFiles(resolve(repositoryRoot, 'src'), (path) => path.endsWith('.ts'));
const declarationFiles = collectFiles(
  resolve(repositoryRoot, 'dist'),
  (path) => path.endsWith('.d.ts') || path.endsWith('.d.cts'),
);

if (declarationFiles.length === 0) {
  throw new Error('No generated declaration files found. Run the build before auditing D1.');
}

report('D1 source any audit', findOccurrences(sourceFiles));
report('D1 declaration any audit', findOccurrences(declarationFiles));
