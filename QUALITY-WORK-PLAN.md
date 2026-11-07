# Package quality and release evidence work plan

Date: 2026-11-07 (Europe/Madrid).

**Goal:** improve release traceability, supported-TypeScript evidence and consumer bundle measurements without changing runtime APIs.

**Architecture:** reuse existing npm packaging checks and installed engineering tools. Independent workers own workflow files, TypeScript consumer checks and bundle measurements; the coordinator owns package scripts, dependency cleanup, integration and the final quality record.

**Constraints:** preserve pre-existing edits, do not commit, push or publish, do not implement 2.3 runtime proposals, add no runtime dependencies. External npm/GitHub account configuration is documented rather than performed.

## Decisions

- Prepare a manual, tag-validated release workflow using npm trusted publishing and provenance. Do not execute it.
- Pin Actions to verified commit SHAs and use explicit job permissions.
- Test installed declarations with TypeScript 5.0.4 and the project's installed compiler, in ESM and CJS consumers. Keep compiler installs outside the repository.
- Measure real browser consumers with esbuild and gzip, enforce explicit per-case budgets and produce machine-readable output.
- Publish no unsupported claims about external scores, security or remote CI. Distinguish local candidate evidence from published 2.2.0.

## Tasks

- [x] 1. Remove only the local self-dependency from package.json and package-lock.json. Extend existing package verification to reject self-dependencies/runtime dependencies; demonstrate failure first.
- [x] 2. Harden .github/workflows/ci.yml and docs.yml; prepare a manual release.yml with version/tag validation, checks, artifacts and a protected publish job. Verify Action SHAs against official repositories.
- [x] 3. Add scripts/check-typescript-compat.mjs and installed consumer fixtures. Run with 5.0.4 and the installed TypeScript, checking both .ts and .cts with strict NodeNext resolution.
- [x] 4. Add scripts/consumer-bundles.mjs, scripts/consumer-budgets.json and focused tests. Cover builderFor, retry pipeline, memoize, semaphore, definePolicy and a decorator; enforce byte/gzip budgets without automatic rebasing.
- [x] 5. Integrate npm commands and CI tasks, add a concise quality/release guide and a machine-readable local verification record with candidate identity and limitations.
- [x] 6. Run format checks, lint, typecheck, tests, one build, existing packaging checks, new TypeScript checks and bundle checks. Review the combined diff and record all outstanding external steps.

## Acceptance

- Runtime source files and public exports remain unchanged.
- Package and lockfile contain no runtime dependency or self-dependency.
- TypeScript minimum/current checks pass for the packed package; temporary installs are cleaned up.
- Consumer bundle measurements are reproducible and budget violations exit nonzero.
- Workflows contain no floating Action refs, default to read-only permissions, and cannot publish on push or pull request.
- Release workflow matches tag to package version and validates the actual tarball before publishing it. npm trusted publisher and environment protection still require account-owner setup.
- Final report records checks actually run, local dirty state and the difference between candidate measurements and published-package observations.

## Validation commands

Use node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner for tests, npm run typecheck, npm run lint, npm run format:check, then one npm run build. Run existing packaging scripts directly after that build to avoid repeated builds. New scripts must expose --help and support use of the existing build where appropriate.

## Execution record

Completed locally with three scoped gpt-6-luna workers and coordinator review. The final coverage run passed 118 files / 924 tests; format, lint, types, build, packaging checks, TypeScript 5.0.4/5.9.3 consumers and six bundle budgets passed. Runtime source is unchanged. Actionlint v1.7.12 and release tag-guard simulations passed. See release/quality/2026-11-07-local-verification.json and the adjacent consumer report. Remote CI, npm trusted publisher settings, GitHub environment reviewers and actual publication were not executed. No commits, pushes or publication occurred.
