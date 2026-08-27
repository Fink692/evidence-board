param(
  [ValidateSet('dev', 'preview', 'check')]
  [string]$Mode = 'dev',
  [ValidateRange(1024, 65535)]
  [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExecutable = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $runtimeRoot 'node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Install Node.js 24, or launch from Codex with its workspace runtime available.' }
$env:PATH = (Split-Path -Parent $nodeExecutable) + [IO.Path]::PathSeparator + $env:PATH
$bundledPnpm = Join-Path $runtimeRoot 'node\node_modules\pnpm\bin\pnpm.cjs'
$pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue

function Invoke-ProjectPnpm {
  param([string[]]$ProjectArguments)
  if ($pnpmCommand) { & $pnpmCommand.Source @ProjectArguments }
  elseif (Test-Path -LiteralPath $bundledPnpm) { & $nodeExecutable $bundledPnpm @ProjectArguments }
  else { throw 'Install pnpm 11.19.0, then run pnpm install in this directory.' }
  if ($LASTEXITCODE -ne 0) { throw "pnpm exited with code $LASTEXITCODE." }
}

Push-Location -LiteralPath $PSScriptRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'))) {
    Invoke-ProjectPnpm -ProjectArguments @('install', '--frozen-lockfile')
  }
  if ($Mode -eq 'check') {
    Invoke-ProjectPnpm -ProjectArguments @('run', 'check')
  } else {
    $viteEntry = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
    if ($Mode -eq 'preview') {
      Invoke-ProjectPnpm -ProjectArguments @('run', 'build')
      & $nodeExecutable $viteEntry preview --host 127.0.0.1 --port $Port --strictPort
    } else {
      & $nodeExecutable $viteEntry --host 127.0.0.1 --port $Port --strictPort
    }
  }
} finally {
  Pop-Location
}
