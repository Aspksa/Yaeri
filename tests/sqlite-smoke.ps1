#requires -Version 5.1
# Run on Windows: powershell -NoProfile -ExecutionPolicy Bypass -File tests/sqlite-smoke.ps1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:YaeriDataOverride = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-sqlite-test-' + [guid]::NewGuid().ToString('N'))
try {
    . (Join-Path $root 'launcher/yaeri-api.ps1')
    [void][System.IO.Directory]::CreateDirectory($script:YaeriDataOverride)
    $script:DataDir = $script:YaeriDataOverride
    $path = Join-Path $script:DataDir 'memory.json'
    $original = @{ version = 1; items = @(@{ id = 'one'; text = 'привет' }) }
    [System.IO.File]::WriteAllText($path, (ConvertTo-YJson $original), $script:Utf8)
    $migrated = Read-YJsonFile $path
    if ($migrated.items[0].text -ne 'привет') { throw 'Legacy JSON migration failed' }
    if (-not (Test-Path (Join-Path $script:DataDir 'yaeri.sqlite3'))) { throw 'SQLite file missing' }
    Write-YJsonFile $path @{ version = 1; items = @(@{ id = 'two'; text = 'новая память' }) }
    # SQLite remains authoritative even if the compatibility JSON becomes stale.
    [System.IO.File]::WriteAllText($path, '{"items":[]}', $script:Utf8)
    $loaded = Read-YJsonFile $path
    if ($loaded.items[0].text -ne 'новая память') { throw 'SQLite readback failed' }
    Write-Host 'SQLite migration and read/write smoke test passed.' -ForegroundColor Green
} finally {
    if (Test-Path $script:YaeriDataOverride) {
        Remove-Item -LiteralPath $script:YaeriDataOverride -Recurse -Force
    }
}
