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

Lefthook runs Commitlint on `commit-msg`.

## Local Quality Gates

Before each commit, Lefthook runs the lightweight checks:

```bash
npm run format:check
npm run lint
```

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

Publishing is protected by `prepublishOnly`, which runs tests, typechecking,
linting, and the dist smoke checks before npm can publish the package.

See `docs/RELEASE.md` for the release checklist.
