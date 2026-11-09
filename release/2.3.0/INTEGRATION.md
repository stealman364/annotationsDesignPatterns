# 2.3.0 controlled consumer integration

The standalone consumer fixture passed against the exact npm prerelease `annotations-design-patterns@2.3.0-rc.1` and a local preliminary 2.3.0 tarball. The release workflow artifact and stable npm registry install have not been retested yet. These are controlled integrations created in this repository; they are not third-party adoption or production-use evidence.

Each artifact passed four isolated installs: Node 20.20.2 and 22.23.4, each with TypeScript 5.9.3 and 5.0.4. All runs used `@types/node@20.19.43` and `npm install --ignore-scripts`. The prerelease came from the npm registry with integrity `sha512-Ga1KchKEfwHpeYiptY+dl6bCvEOEWuleJF9rfwFTKgRt7n0Y/GyaWII04LvuXdf2s8uIdGZukOuCfEajZF0/bA==`. The stable tarball has integrity `sha512-EMoDbNPUyReSeMI0OPeCRqcntEni9TUUHWI4ZR9MVakPUIqb6O5D707oX+Fp5+z+dBsBBzC2fkxRkpTogsaR9A==` and installed version 2.3.0.

The application uses a local HTTP server to exercise retry, timeout and fallback, circuit-breaker opening, memoized concurrent requests, rate limiting, and counter events. It also checks synchronous `executionMethod` returns, cached promise identity, TC39 `@When`/`@TransitionTo` guard order, reject-stale completion when concurrent transitions finish out of order, manual transition invalidation, and `AsyncMemoryStore` updater/read/clear ordering.

Matrix rows with exact package identity and each scenario result are recorded in [integration/EVIDENCE.json](integration/EVIDENCE.json). Reproduce with [integration/validate.ps1](integration/validate.ps1). After stable npm publication, rerun `./validate.ps1 -PackageSpec 2.3.0 -EvidencePath .validation/stable-npm-matrix.json` to record registry identity separately from the tarball evidence.
