import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactsDirectory = resolve(repositoryRoot, '.artifacts');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const allowedMetadata = new Set(['LICENSE', 'README.md', 'package.json']);
const requiredFiles = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
  'dist/public/operators.js',
  'dist/public/operators.cjs',
  'dist/public/operators.d.ts',
  'dist/public/operators.d.cts',
  'dist/public/pipe.js',
  'dist/public/pipe.cjs',
  'dist/public/pipe.d.ts',
  'dist/public/pipe.d.cts',
  'dist/public/run.js',
  'dist/public/run.cjs',
  'dist/public/run.d.ts',
  'dist/public/run.d.cts',
  'dist/policy/index.js',
  'dist/policy/index.cjs',
  'dist/policy/index.d.ts',
  'dist/policy/index.d.cts',
  'dist/decorators/index.js',
  'dist/decorators/index.cjs',
  'dist/decorators/index.d.ts',
  'dist/decorators/index.d.cts',
  'dist/experimental/index.js',
  'dist/experimental/index.cjs',
  'dist/experimental/index.d.ts',
  'dist/experimental/index.d.cts',
  'dist/observability/index.js',
  'dist/observability/index.cjs',
  'dist/observability/index.d.ts',
  'dist/observability/index.d.cts',
  'dist/node/index.js',
  'dist/node/index.cjs',
  'dist/node/index.d.ts',
  'dist/node/index.d.cts',
  'dist/store/index.js',
  'dist/store/index.cjs',
  'dist/store/index.d.ts',
  'dist/store/index.d.cts',
];

if (existsSync(artifactsDirectory)) {
  throw new Error('Refusing to delete an existing .artifacts directory. Remove it manually first.');
}

mkdirSync(artifactsDirectory);

try {
  const output = execFileSync(
    npmCommand,
    ['pack', '--ignore-scripts', '--json', '--pack-destination', artifactsDirectory],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  const jsonStart = output.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('npm pack did not produce JSON output.');
  }

  const [packResult] = JSON.parse(output.slice(jsonStart));
  const files = packResult.files.map(({ path }) => path);

  const forbiddenFiles = files.filter(
    (path) => !path.startsWith('dist/') && !allowedMetadata.has(path),
  );

  if (forbiddenFiles.length > 0) {
    throw new Error(`Package contains forbidden files: ${forbiddenFiles.join(', ')}`);
  }

  const missingFiles = requiredFiles.filter((path) => !files.includes(path));
  if (missingFiles.length > 0) {
    throw new Error(`Package is missing required files: ${missingFiles.join(', ')}`);
  }

  console.log(`package verification OK (${files.length} files)`);
} finally {
  rmSync(artifactsDirectory, { force: true, recursive: true });
}
