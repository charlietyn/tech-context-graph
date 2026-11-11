<#
  TCG-05 · Windows-native local certification (no GitHub Actions).

  Clones the branch into a path WITH SPACES, reaches it through a JUNCTION, isolates Graphify in a
  disposable venv, and runs every gate from the junction path with TEMP also redirected to a path
  with spaces. Nothing global is modified: no `npm link`, no `uv tool install`, no git config.

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\certify-windows.ps1 `
      -Source <git url or path> [-Base "$env:TEMP\tcg cert 05"] [-Graphify 0.9.105]

  A WSL checkout can be the source: -Source \\wsl.localhost\<distro>\home\<user>\...\tech-context-graph
  Evidence: "<Base>\evidence <sha>\summary.json" plus jest.json, smoke JSON and one log per gate.
#>
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Base = (Join-Path $env:TEMP 'tcg cert 05'),
  [string]$Branch = 'agents-total-integration',
  [string]$Graphify = '0.9.105'
)
$ErrorActionPreference = 'Stop'
Set-Location $env:TEMP
$real = Join-Path $Base 'real checkout'
$junction = Join-Path $Base 'via junction'
$repo = Join-Path $junction 'tech context graph'
$venv = Join-Path $Base "graphify $Graphify"
if (-not (Test-Path (Join-Path $real 'tech context graph'))) {
  New-Item -ItemType Directory -Force -Path $real | Out-Null
  # safe.directory only for this command: a WSL path is owned by another user from Windows' view.
  git -c safe.directory=* clone -q --branch $Branch $Source (Join-Path $real 'tech context graph')
}
if (-not (Test-Path $junction)) { cmd /c mklink /J "`"$junction`"" "`"$real`"" | Out-Null }
if (-not (Test-Path (Join-Path $venv 'Scripts\graphify.exe'))) {
  uv venv -q $venv
  $env:VIRTUAL_ENV = $venv; uv pip install -q "graphifyy==$Graphify"; Remove-Item Env:VIRTUAL_ENV
}

Set-Location $repo
git -c safe.directory=* pull -q --ff-only origin $Branch
$sha = git rev-parse HEAD
# Gates are judged by exit code. With 'Stop', Windows PowerShell 5.1 turns any native stderr line
# (an `npm warn`, a Git CRLF notice) into a terminating error, so it applies to setup only.
$ErrorActionPreference = 'Continue'
$out = Join-Path $Base "evidence $($sha.Substring(0, 7))"; New-Item -ItemType Directory -Force -Path $out | Out-Null
$tmp = Join-Path $Base 'tmp with spaces'; New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$env:TEMP = $tmp; $env:TMP = $tmp
$env:TCG_CONFIG_HOME = Join-Path $Base 'config home'
$results = [ordered]@{ sha = $sha; cwd = (Get-Location).Path; linkType = (Get-Item $junction).LinkType; realCwd = (Get-Item $junction).Target }
function Step($name, [scriptblock]$block) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  & $block *> (Join-Path $out "$name.log")
  $results[$name] = @{ exitCode = $LASTEXITCODE; seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1) }
}
Step 'npm-ci' { npm ci }
Step 'lint-types' { npm run lint:types }
Step 'test' { npx jest --runInBand --json --outputFile="$out\jest.json" }
Step 'build' { npm run build }
Step 'smoke-contract' { node scripts/smoke-technology-contract.cjs }
$env:PATH = (Join-Path $venv 'Scripts') + ';' + $env:PATH
$env:GRAPHIFY_BACKEND = 'none'
$results['graphify'] = (graphify --version) -join ' '
Step 'smoke-graphify-real' { node scripts/smoke-graphify-real.cjs }
Step 'smoke-crash-recovery' { node scripts/smoke-crash-recovery.cjs }
foreach ($file in 'graphify-smoke.json', 'crash-recovery.json') {
  if (Test-Path "ci-evidence\$file") { Copy-Item "ci-evidence\$file" (Join-Path $out $file) }
}
$results['node'] = node --version; $results['npm'] = npm --version; $results['git'] = git --version
$results['os'] = (Get-CimInstance Win32_OperatingSystem | ForEach-Object { "$($_.Caption) $($_.Version)" })
$failed = @($results.Keys | Where-Object { $results[$_] -is [hashtable] -and $results[$_].exitCode -ne 0 })
$results['outcome'] = if ($failed.Count) { 'FAIL' } else { 'PASS' }
$results | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $out 'summary.json')
Get-Content (Join-Path $out 'summary.json')
if ($failed.Count) { exit 1 }
