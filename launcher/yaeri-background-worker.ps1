#requires -Version 5.1
# Yaeri background worker: all AI and memory mutations happen in a disposable
# snapshot. The HTTP server is the sole process allowed to publish JSON changes.
param(
    [Parameter(Mandatory = $true)][string]$SnapshotDir,
    [string]$RequestFile = '',
    [string]$ResultFile = ''
)
$ErrorActionPreference = 'Stop'
$script:YaeriDataOverride = [System.IO.Path]::GetFullPath($SnapshotDir)
if (-not [System.IO.Directory]::Exists($script:YaeriDataOverride)) { throw 'Background snapshot does not exist.' }
. (Join-Path $PSScriptRoot 'yaeri-api.ps1')
Import-YConfig
Import-YStore
# No direct access to the live data directory is retained by any module.
if ($RequestFile) {
    try {
        $request = Read-YJsonFile $RequestFile
        $response = Invoke-YApi ([string]$request.method) ([string]$request.path) ([string]$request.body)
        Write-YJsonFile $ResultFile @{ ok = $true; response = (ConvertTo-YPlain $response) }
    } catch {
        Write-YJsonFile $ResultFile @{ ok = $false; error = $_.Exception.Message }
        throw
    }
} else {
    Invoke-Y3Tick
    Invoke-YEvolutionTick
    if ($script:YE5.enabled -and $script:YE5.periodic) { [void](Invoke-YE5Cycle) }
    if ($ResultFile) { Write-YJsonFile $ResultFile @{ ok = $true } }
}
