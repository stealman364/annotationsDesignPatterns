import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const usage = `Usage: node scripts/check-typescript-compat.mjs [options]

Checks packed package declarations with strict NodeNext consumers.

Options:
  --compiler installed|5.0.4|all  Compiler selection (default: all; installed uses repository TypeScript)
  --tarball <path>                Use an existing package tarball
  --help                          Show this help`;

function parseArguments(arguments_) {
  let compiler = 'all';
  let tarball;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--compiler') {
      compiler = arguments_[index + 1];
      index += 1;
      if (!['installed', '5.0.4', 'all'].includes(compiler)) {
        throw new Error('--compiler must be installed, 5.0.4, or all');
      }
    } else if (argument === '--tarball') {
      tarball = arguments_[index + 1];
      index += 1;
      if (!tarball || tarball.startsWith('--')) throw new Error('--tarball requires a path');
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return { compiler, tarball };
}

function run(command, arguments_, cwd, captureOutput = false) {
  return execFileSync(command, arguments_, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && command === npmCommand,
    stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (options?.help) {
  console.log(usage);
} else if (options) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'annotations-types-compat-'));
  const resolvedTemporaryDirectory = resolve(temporaryDirectory);
  try {
    let tarball = options.tarball ? resolve(options.tarball) : undefined;
    if (tarball && !existsSync(tarball)) throw new Error(`Tarball does not exist: ${tarball}`);

    if (!tarball) {
      const packOutput = run(
        npmCommand,
        ['pack', '--ignore-scripts', '--json', '--pack-destination', temporaryDirectory],
        repositoryRoot,
        true,
      );
      const jsonStart = packOutput.indexOf('[');
      if (jsonStart === -1) throw new Error('npm pack did not produce JSON output.');
      const [{ filename }] = JSON.parse(packOutput.slice(jsonStart));
      tarball = join(temporaryDirectory, filename);
    }

    const compilers = options.compiler === 'all' ? ['5.0.4', 'installed'] : [options.compiler];
    for (const compiler of compilers) {
      const consumerDirectory = join(
        temporaryDirectory,
        `consumer-${compiler.replaceAll('.', '-')}`,
      );
      const source = join(consumerDirectory, 'compat-types.ts');
      const v23Source = join(consumerDirectory, 'v23-types.ts');
      const version =
        compiler === 'installed'
          ? JSON.parse(
              readFileSync(
                join(repositoryRoot, 'node_modules', 'typescript', 'package.json'),
                'utf8',
              ),
            ).version
          : compiler;
      const compilerLabel =
        compiler === 'installed'
          ? `repository-installed TypeScript ${version}`
          : `TypeScript ${version}`;

      mkdirSync(consumerDirectory);
      writeFileSync(
        join(consumerDirectory, 'package.json'),
        JSON.stringify({
          name: 'typescript-compat-consumer',
          private: true,
          type: 'module',
        }),
      );
      const fixture = readFileSync(new URL('./fixtures/rc-types.ts', import.meta.url));
      writeFileSync(source, fixture);
      writeFileSync(join(consumerDirectory, 'compat-types.cts'), fixture);
      const v23Fixture = readFileSync(new URL('./fixtures/v23-types.ts', import.meta.url));
      writeFileSync(v23Source, v23Fixture);
      writeFileSync(join(consumerDirectory, 'v23-types.cts'), v23Fixture);
      run(
        npmCommand,
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
          tarball,
          ...(compiler === 'installed' ? [] : [`typescript@${version}`]),
        ],
        consumerDirectory,
      );

      const compilerEntry =
        compiler === 'installed'
          ? join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc')
          : join(consumerDirectory, 'node_modules', 'typescript', 'bin', 'tsc');
      run(
        process.execPath,
        [
          compilerEntry,
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--strict',
          '--noEmit',
          '--target',
          'ES2022',
          source,
          source.replace(/\.ts$/, '.cts'),
          v23Source,
          v23Source.replace(/\.ts$/, '.cts'),
        ],
        consumerDirectory,
      );
      console.log(`${compilerLabel}: strict NodeNext .ts and .cts declarations OK`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    const temporaryParent = resolve(tmpdir());
    const temporaryPrefix = `${temporaryParent}${sep}`;
    if (
      resolvedTemporaryDirectory.startsWith(temporaryPrefix) &&
      basename(resolvedTemporaryDirectory).startsWith('annotations-types-compat-')
    ) {
      rmSync(resolvedTemporaryDirectory, { force: true, recursive: true });
    } else {
      console.error(
        `Refusing to remove unexpected temporary directory: ${resolvedTemporaryDirectory}`,
      );
      process.exitCode = 1;
    }
  }
}
