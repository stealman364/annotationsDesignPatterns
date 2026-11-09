# Controlled consumer integration

This standalone application exercises the exact npm prerelease and a release tarball from isolated installs. It is a controlled integration created in this repository; it is not third-party adoption or production-use evidence.

Run from PowerShell:

```powershell
./validate.ps1
```

The default matrix pins `annotations-design-patterns@2.3.0-rc.1`, Node 20.20.2 and 22.23.4, and TypeScript 5.9.3 and 5.0.4. The package spec is an argument, so the same fixture can be rerun with a stable version or tarball:

```powershell
./validate.ps1 -PackageSpec '2.3.0'
./validate.ps1 -PackageSpec 'C:/path/to/annotations-design-patterns-2.3.0.tgz' -ExpectedPackageVersion '2.3.0'
```

Each matrix cell copies the fixture into `.validation/`, installs the named npm package plus the selected compiler there, compiles the TC39 decorators, then runs the app with the selected Node binary. No workspace alias, root package install, or repository build is used. Temporary installs, lockfiles, and output are ignored.

The app starts a local HTTP server and checks retry after a 503, timeout with fallback, breaker rejection, memoized repeated requests, rate limiting, and event delivery. It also checks `StateMachine` stale async transition rejection, manual transition invalidation, `@When` guard placement, and `AsyncMemoryStore` same-key updater ordering, non-blocking committed reads, and `clear()` admission ordering.

Do not cite these results as external adoption. Record the exact package version/integrity, Node and TypeScript versions, and each scenario result in the release integration report.
