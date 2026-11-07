# Contributing

## Development Setup

Install dependencies with:

```bash
npm install
```

The `prepare` script installs Lefthook git hooks automatically.

## Commit Messages

Commits must follow Conventional Commits:

```bash
feat: add async support to Emits
fix: avoid emitting rejected async results
docs: add release guide
test: cover dist imports
chore: configure lefthook
```

Lefthook runs Commitlint on `commit-msg`. Header and body lines must be at most
100 characters.

## Local Quality Gates

Before each commit, Lefthook runs the lightweight checks on staged files only
(files under `website/` are excluded):

- Prettier formats staged files and re-stages them, so formatting never blocks
  a commit;
- ESLint checks staged `.ts` files.

Hook output is printed without colors so it stays readable in the VS Code Git
log.

Before each push, Lefthook runs the heavier checks:

```bash
npm run typecheck
npm test
npm run test:dist
```

## Useful Commands

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run test:dist
npm run changeset
```

## Changelog

User-visible changes should include a Changeset:

```bash
npm run changeset
```

Choose the SemVer bump that matches the public impact:

- `patch` for compatible bug fixes and documentation corrections;
- `minor` for compatible features, options, exports, or behavior;
- `major` for breaking changes.

Changesets will update `CHANGELOG.md` when maintainers run:

```bash
npm run version
```

Use these sections when relevant:

- `Added`
- `Changed`
- `Deprecated`
- `Removed`
- `Fixed`
- `Security`

## Public API Policy

The supported public API is:

- root exports from `annotations-design-patterns`;
- granular exports documented in `package.json` `exports`, such as
  `annotations-design-patterns/utility/retry`.

Do not rely on private source paths outside the package exports map.

## Breaking Changes

Changing decorator names, option names, return types, package export paths, or
observable runtime behavior is a breaking change and requires a major version.

Error message wording may change in minor or patch releases unless explicitly
documented as stable.

## Deprecations

Deprecated APIs should stay available for at least one minor release before
removal. Removal only happens in a major version.

## Test Expectations

Behavior changes should include unit tests. Type-level API changes should include
`expectTypeOf` coverage. Package export or build changes should keep
`npm run test:dist` passing.

## Publishing Gate

Local source publication runs `prepublishOnly` for tests, typechecking, linting
and dist smoke checks. The release workflow runs those checks explicitly before
publishing its validated tarball with lifecycle scripts disabled.

Prepare version changes with Changesets and review the generated changelog before
creating the release tag. The manual release workflow validates the tag against
the package version, checks the package and publishes the validated tarball with
npm trusted publishing and provenance. It never publishes on push or pull request.

See [RELEASING.md](RELEASING.md) for the required npm trusted-publisher and GitHub
environment setup. Those account settings must be configured by the owner before
the workflow is used. A published version can never be republished.

See [QUALITY.md](QUALITY.md) for reproducible package, TypeScript compatibility and
consumer bundle checks, and the distinction between local and published evidence.
