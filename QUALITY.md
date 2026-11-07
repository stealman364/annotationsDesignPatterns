# Package quality evidence

This project separates the published npm artifact, a local working candidate and remote CI results. A successful local check is not evidence that a commit was published or that GitHub Actions ran.

## Reproduce local checks

Install the locked development dependencies and build once:

```sh
npm ci
npm run build
```

Run the source checks and the checks against that build:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
node scripts/audit-any.mjs
node scripts/bundle-budget.mjs
node scripts/consumer-bundles.mjs --output quality/consumer-bundles.json
node scripts/check-typescript-compat.mjs
node scripts/smoke-dist.mjs
node scripts/smoke-dist.cjs
node scripts/verify-package.mjs
node scripts/smoke-package.mjs
node node_modules/publint/src/cli.js
node node_modules/@arethetypeswrong/cli/dist/index.js --pack
```

`npm run bundle:consumers` and `npm run types:compat` are convenience commands that first rebuild. The TypeScript compatibility checker uses isolated temporary consumers with the installed compiler and TypeScript 5.0.4; its compiler download requires network access. Check its `--help` for compiler selection and tarball reuse.

Run checks that invoke `npm pack` sequentially. In the local Windows/npm environment,
packing invoked `prepare` even with `--ignore-scripts`; concurrent packs raced while
installing Git hooks. The same compatibility check passed when run sequentially.

The zero-runtime-dependency contract is enforced by package verification and manifest tests. A dependency change requires an explicit review of that public promise.

## Interpret sizes correctly

- `scripts/bundle-budget.mjs` sums reachable distribution modules per entrypoint. Those measurements are not minified consumer bundles.
- `scripts/consumer-bundles.mjs` builds representative browser consumers with esbuild, minification, tree shaking and gzip. It checks the reviewed limits in `scripts/consumer-budgets.json`; it does not automatically rewrite them.
- Bundlephobia measures its own package bundle. Its result is not the cost of every individual import.
- npm unpacked size measures installed package contents, including declarations and both module formats. It is not a browser download size.

Retain the consumer JSON report with the exact package version, commit and dirty-state information. Review budget changes by case rather than raising all limits together.

## External observations

The following were checked on 2026-11-07 for the published 2.2.0 package. They are historical observations, not live guarantees or candidate-release measurements.

| Service       | Observation                                                               | Source                                                                                            |
| ------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Bundlephobia  | 32,525 minified bytes, 8,951 gzip bytes, zero dependencies                | [2.2.0 API result](https://bundlephobia.com/api/size?package=annotations-design-patterns%402.2.0) |
| Socket        | Version-specific badge displayed 80; the alert breakdown was inaccessible | [Version-specific badge](https://badge.socket.dev/npm/package/annotations-design-patterns/2.2.0)  |
| Snyk          | No known direct vulnerabilities recorded for 2.2.0                        | [Package record](https://security.snyk.io/package/npm/annotations-design-patterns)                |
| npms.io       | Package lookup returned 404                                               | [Package API](https://api.npms.io/v2/package/annotations-design-patterns)                         |
| Packagephobia | Automated lookup was blocked with HTTP 429                                | [Package page](https://packagephobia.com/result?p=annotations-design-patterns%402.2.0)            |

The Socket general page was still displaying 2.0.0 during the check. Compare versioned results. Absence of known vulnerabilities does not prove absence of vulnerabilities or concurrency defects. Downloads and third-party scores do not establish API correctness.

The published tarball was also checked in memory with publint 0.3.22 (no messages) and Are the Types Wrong core 0.18.5 (no reported problems). Those tool checks have finite scope; installed consumer fixtures remain necessary.

## Release traceability

See [RELEASING.md](RELEASING.md) for the manually invoked release workflow and the npm/GitHub configuration required from the account owner. Preparing the workflow does not enable trusted publishing, configure required reviewers or publish a package.
