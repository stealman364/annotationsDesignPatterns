# Release procedure

The GitHub Actions release workflow prepares and publishes an npm release only after a maintainer starts it manually with a version tag selected as the workflow ref. It checks that the tagged `package.json` has the matching version and uses that immutable workflow commit for validation and publication context. It does not run on tag pushes, branch pushes, or pull requests.

The build job runs the project checks, creates the package tarball with lifecycle scripts disabled, checks the package name and version inside that tarball, and records its npm integrity and source commit. It uploads that exact tarball with candidate quality evidence. The protected publish job downloads the artifact, verifies its recorded SHA-256 and package identity, and publishes the downloaded tarball with npm provenance. Stable versions use the `latest` dist-tag; prereleases use `next`.

The uploaded `quality/release.json` and `quality/consumer-bundles.json` describe a validated release candidate. They are evidence from this workflow run and do not claim that a package is already published, that remote security services scored it, or that external account settings were completed.

## One-time account setup

An npm organization or package owner must configure trusted publishing for the `annotations-design-patterns` package:

1. In the npm package settings, add a trusted publisher for GitHub Actions with owner `stealman364`, repository `annotationsDesignPatterns`, workflow file `release.yml`, and environment `npm-release`.
2. In the GitHub repository settings, create the `npm-release` environment. Add required reviewers and restrict deployment to version tags (`v*`) if that option is available for the repository. Keep the environment name identical to the npm trusted publisher configuration.
3. Confirm the package is configured to accept provenance from that trusted publisher. Do not add an npm automation token to repository secrets; the publish job uses GitHub's OIDC identity and npm trusted publishing.

Consult npm's current [trusted publishing setup guide](https://docs.npmjs.com/trusted-publishers/) for the package settings UI and eligibility details. GitHub environment protection is an external repository setting; the workflow file alone cannot enforce reviewer configuration. Until the owner completes and verifies these settings, the publish job is not ready to release.

## Releasing a version

1. Complete the release PR, update the changelog, and merge the version bump.
2. Create and push the matching annotated tag, such as `v2.3.0` or `v2.3.0-rc.1`.
3. In GitHub Actions, start **Release** manually and select that tag as the workflow ref. The equivalent CLI command is `gh workflow run release.yml --ref v2.3.0`. Review the validation output and uploaded candidate evidence.
4. The publish job waits for the `npm-release` environment's configured reviewers. After approval, it publishes the already validated tarball.

The workflow grants `id-token: write` only to the publish job. It requires a tag ref whose name matches the package version, Node.js 24 and npm 11.5.1 or newer for trusted publishing, uses `--provenance --ignore-scripts`, and does not build a second package during publication. A branch ref, mismatched tag, or changed artifact fails before publication.
