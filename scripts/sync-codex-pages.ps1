param()

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceJs = Join-Path $repoRoot "js"
$sourceStyles = Join-Path $repoRoot "styles"
$targetRoot = Join-Path $repoRoot "deploy\\codex-pages"
$targetJs = Join-Path $targetRoot "js"
$targetStyles = Join-Path $targetRoot "styles"

if (-not (Test-Path $sourceJs)) {
  throw "Source js directory not found: $sourceJs"
}

if (-not (Test-Path $sourceStyles)) {
  throw "Source styles directory not found: $sourceStyles"
}

if (-not (Test-Path $targetRoot)) {
  throw "Codex Pages target directory not found: $targetRoot"
}

Copy-Item -Path (Join-Path $sourceJs "*") -Destination $targetJs -Recurse -Force
Copy-Item -Path (Join-Path $sourceStyles "*") -Destination $targetStyles -Recurse -Force

Write-Output "Codex Pages bundle synced from source tree."
