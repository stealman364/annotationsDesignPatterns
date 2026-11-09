# 2.3.0 stable release plan

Date: 2026-11-09. User authorization: close validation and publish 2.3.0 stable.

Goal: publish the reviewed 2.3 runtime as stable, preserving experimental labels,
using the protected release workflow and verifying the exact npm artifact.
No new runtime features or dependency changes are in scope.

- [x] Run controlled standalone functional and TC39 decorator applications using
      the exact npm RC (`2.3.0-rc.1`), Node 20/22 and strict TypeScript. Record package
      integrity, environments and actual results. Do not call this external adoption.
- [x] Review release blockers and confirm AsyncMemoryStore mutation ordering and
      experimental boundaries are disclosed. Update stabilization status and stable
      release notes, README and current ES/EN documentation; preserve historical notes.
- [x] Set package/lock version to `2.3.0`; validate build, tests, coverage, types,
      package resolution, packed consumers, budgets and full security audits. Run
      controlled applications against the exact local candidate tarball as well.
- [ ] Commit and push a release branch; require CI on the final commit, merge
      normally, tag the selected merged commit as `v2.3.0`, and dispatch release.yml
      on that tag. The workflow validates and publishes its own immutable tarball
      through npm trusted publishing with provenance and dist-tag `latest`.
- [ ] Observe publication completion; verify registry version, integrity,
      provenance, zero runtime dependencies and `latest`. Install published `2.3.0`
      into isolated consumers and rerun integration/ESM/CJS/types. Record actual
      publication and deployed documentation evidence; do not overwrite an npm version.

Publication can be blocked by actual CI failures or protected environment/npm
permissions. Resolve permitted failures; do not weaken protections, invent
external adoption, reuse a published version or report a queued job as published.
