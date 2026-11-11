#requires -Version 5.1
# Yaeri background worker: all AI and memory mutations happen in a disposable
# snapshot. The HTTP server is the sole process allowed to publish JSON changes.
param([Parameter(Mandatory = $true)][string]$SnapshotDir)
$ErrorActionPreference = 'Stop'
$script:YaeriDataOverride = [System.IO.Path]::GetFullPath($SnapshotDir)
if (-not [System.IO.Directory]::Exists($script:YaeriDataOverride)) { throw 'Background snapshot does not exist.' }
. (Join-Path $PSScriptRoot 'yaeri-api.ps1')
Import-YConfig
Import-YStore
# No direct access to the live data directory is retained by any module.
Invoke-Y3Tick
Invoke-YEvolutionTick
