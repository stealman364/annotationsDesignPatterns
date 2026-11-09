param(
  [string]$PackageSpec = '2.3.0-rc.1',
  [string[]]$NodeVersions = @('20.20.2', '22.23.4'),
  [string[]]$TypeScriptVersions = @('5.9.3', '5.0.4'),
  [string]$Node20 = 'C:/Users/Enrique/AppData/Local/npm-cache/_npx/ebaba8b9e55fd0a9/node_modules/node/bin/node.exe',
  [string]$Node22 = 'C:/Users/Enrique/AppData/Local/npm-cache/_npx/e609a7c1edf98e65/node_modules/node/bin/node.exe',
  [string]$ExpectedPackageVersion,
  [string]$EvidencePath = '.validation/integration-evidence.json'
)
$ErrorActionPreference = 'Stop'
$fixture = $PSScriptRoot
$validationRoot = Join-Path $fixture '.validation'
New-Item -ItemType Directory -Force -Path $validationRoot | Out-Null
$evidence = [System.Collections.Generic.List[object]]::new()
$isTarball = $PackageSpec -match '(?i)(\.tgz|\.tar\.gz)(\?.*)?$' -or $PackageSpec -match '^https?://'
if ($isTarball -and !$ExpectedPackageVersion) { throw 'Tarball or URL installs require -ExpectedPackageVersion.' }
if (!$isTarball -and !$ExpectedPackageVersion) { $ExpectedPackageVersion = $PackageSpec }

foreach ($nodeVersion in $NodeVersions) {
  $node = if ($nodeVersion -eq '20.20.2') { $Node20 } else { $Node22 }
  if (!(Test-Path -LiteralPath $node)) { throw "Node $nodeVersion executable not found: $node" }
  $actualNode = (& $node --version).Trim()
  if ($actualNode -ne "v$nodeVersion") { throw "Expected Node $nodeVersion at $node, got $actualNode" }
  $nodeBin = Split-Path -Parent $node
  $oldPath = $env:PATH
  $env:PATH = "$nodeBin;$oldPath"
  try {
    foreach ($tsVersion in $TypeScriptVersions) {
      $runRoot = Join-Path $validationRoot ("run-{0}-node-{1}-ts-{2}" -f ([guid]::NewGuid().ToString('N')), $nodeVersion, $tsVersion)
      New-Item -ItemType Directory -Force -Path $runRoot | Out-Null
      Copy-Item -LiteralPath (Join-Path $fixture 'src') -Destination $runRoot -Recurse
      Copy-Item -LiteralPath (Join-Path $fixture 'tsconfig.json') -Destination $runRoot
      Push-Location $runRoot
      try {
        npm init --yes | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'npm init failed' }
        npm pkg set type=module | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'npm pkg set failed' }
        $installSpec = if ($isTarball) { $PackageSpec } else { "annotations-design-patterns@$PackageSpec" }
        npm install --ignore-scripts --save-exact --no-audit --no-fund $installSpec "typescript@$tsVersion" '@types/node@20.19.43'
        if ($LASTEXITCODE -ne 0) { throw "npm install failed for $installSpec" }
        $installed = Get-Content (Join-Path $runRoot 'node_modules/annotations-design-patterns/package.json') -Raw | ConvertFrom-Json
        if ($installed.name -ne 'annotations-design-patterns') { throw "Installed unexpected package $($installed.name)" }
        if ($ExpectedPackageVersion -and $installed.version -ne $ExpectedPackageVersion) { throw "Installed $($installed.version), expected $ExpectedPackageVersion" }
        $tsc = Join-Path $runRoot 'node_modules/typescript/bin/tsc'
        & $node $tsc -p tsconfig.json
        if ($LASTEXITCODE -ne 0) { throw "TypeScript $tsVersion failed under Node $nodeVersion" }
        & $node (Join-Path $runRoot 'dist/app.js')
        if ($LASTEXITCODE -ne 0) { throw "Application integration failed under Node $nodeVersion / TypeScript $tsVersion" }
        $lockPath = Join-Path $runRoot 'package-lock.json'
        $lockEntryJson = & $node -e "const p=require('node:fs').readFileSync(process.argv[1],'utf8'); const j=JSON.parse(p); const x=j.packages['node_modules/annotations-design-patterns']; const t=j.packages['node_modules/@types/node']; console.log(JSON.stringify({integrity:x.integrity,resolved:x.resolved,nodeTypesVersion:t.version}))" $lockPath
        if ($LASTEXITCODE -ne 0) { throw 'Could not extract package identity from npm lockfile' }
        $lockEntry = $lockEntryJson | ConvertFrom-Json
        $evidence.Add([pscustomobject]@{
          packageSpec = $PackageSpec
          packageName = $installed.name
          packageVersion = $installed.version
          node = $actualNode
          typescript = $tsVersion
          nodeTypes = $lockEntry.nodeTypesVersion
          integrity = $lockEntry.integrity
          resolved = $lockEntry.resolved
          scenarios = @('retry', 'timeout+fallback', 'circuit breaker', 'memoize/coalescing', 'memoize promise identity', 'executionMethod sync return', 'rateLimit', 'StateMachine inverted completion/manual invalidation/When guard', 'AsyncMemoryStore mutation ordering')
          result = 'PASS'
        })
      } finally {
        Pop-Location
      }
    }
  } finally {
    $env:PATH = $oldPath
  }
}
$reportPath = if ([System.IO.Path]::IsPathRooted($EvidencePath)) { $EvidencePath } else { Join-Path $fixture $EvidencePath }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportPath) | Out-Null
[System.IO.File]::WriteAllText($reportPath, (ConvertTo-Json -InputObject $evidence.ToArray() -Depth 4), [System.Text.UTF8Encoding]::new($false))
Write-Output "Evidence written: $reportPath"
