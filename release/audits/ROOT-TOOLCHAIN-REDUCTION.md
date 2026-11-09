# Root toolchain audit reduction

Date: 2026-11-09

The root dependency tree now has zero npm audit findings. `npm audit --json` and `npm audit --omit=dev --json` evidence is saved in `migration-root-audit.json` and `migration-root-audit-prod.json` beside this report.

The root toolchain refreshes ESLint to 10.14.0 and typescript-eslint to 8.72.1, and refreshes the tsup range only to 8.5.1. The lockfile resolves minimatch 11.0.5 and esbuild 0.28.2. Targeted overrides are recorded in the root `package.json`:

- minimatch 11.0.5 for `eslint`, `@eslint/config-array`, and `@typescript-eslint/typescript-estree`. ESLint's installed helper uses the public `Minimatch` constructor and `.match()` method; the TypeScript ESLint runtime does not import minimatch. This avoids relying on removed internal methods such as `matchOne`.
- esbuild 0.28.2 for `tsup`, `bundle-require`, and `vite`. The resolved tree contains a single patched esbuild version and no nested vulnerable copy.

These are out-of-range compatibility overrides: ESLint and typescript-eslint declare minimatch 10 ranges, and tsup 8 declares esbuild `^0.27.0`. The installed APIs were exercised by the checks below. tsup 9.0.0 was evaluated and rejected because its published engine range is `^22.18.0 || ^24.11.0 || >=26.0.0`, which would raise the development toolchain floor beyond Node 20. tsup 8.5.1 declares Node `>=18`; esbuild 0.28.2 also declares Node `>=18`; minimatch 11.0.5 declares `20 || >=22`. The package's published runtime engine remains `>=20`.

Validation on Node v22.18.0 after a clean `npm ci`:

- `npm audit --json`: zero findings.
- `npm audit --omit=dev --json`: zero findings.
- `npm ls eslint minimatch esbuild tsup --all`: resolved without invalid dependencies; minimatch 11.0.5, esbuild 0.28.2, tsup 8.5.1.
- `npm test`: 135 test files and 1,115 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run bundle:check`: passed; 96 ESM/CJS entrypoints within budget.
- `npm run bundle:consumers`: passed; six consumer bundles and no budget violations.
- `npm run pack:verify`: passed; 269 package files verified.
- `npm run lint:package`: passed; publint reported “All good!”.

The parent subsequently found cached Node 20.20.2 and executed `test:dist` (including a build), all 1,115 tests, lint, typecheck and the packed ESM/CJS/type consumers successfully. See `migration-node20-checks.json`. The package runtime floor remains Node >=20. ESLint 10.14.0 requires `^20.19.0 || ^22.13.0 || >=24`, and typescript-eslint 8.72.1 requires Node >=20.9 within its declared supported lines; those are development-tool requirements, not a change to the published package runtime requirement.

Final sequential parent validation on Node 22.23.4 passed formatting, lint, typecheck, tests, build, publint, Are the Types Wrong, package verification, packed consumers, bundle/consumer budgets and strict TypeScript 5.0.4/5.9.3 consumers. Exact command exit statuses are in `migration-root-checks.json`. ESLint's actual file-selection result matched all 249 tracked target files with no missing/extra paths or lint errors (`migration-eslint-selection.json`). These checks cover this repository and its consumers; they do not establish compatibility for every possible third-party glob or bundler configuration.
