#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testData = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-bg-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($testData)
$script:YaeriDataOverride = $testData
. (Join-Path $root 'launcher/yaeri-api.ps1')
. (Join-Path $root 'launcher/yaeri-background.ps1')
function New-DoneProcess {
    $proc = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile -Command "exit 0"' -PassThru -WindowStyle Hidden
    $proc.WaitForExit()
    return $proc
}
function New-Snapshot([string]$Label) {
    $base = Join-Path $testData ($Label + '-work')
    $snap = Join-Path $base 'snapshot'
    [void][System.IO.Directory]::CreateDirectory($snap)
    Copy-Item -LiteralPath (Join-Path $testData 'state.json') -Destination (Join-Path $snap 'state.json')
    return @{ base = $base; snapshot = $snap; original = (Get-YBgFiles $snap); process = (New-DoneProcess) }
}
try {
    Import-YConfig
    Import-YStore
    $live = Join-Path $testData 'state.json'
    [System.IO.File]::WriteAllText($live, '{"value":"initial"}')
    $job = New-Snapshot 'successful'
    [System.IO.File]::WriteAllText((Join-Path $job.snapshot 'state.json'), '{"value":"worker"}')
    $script:YBgJob = $job
    if (-not (Complete-YBackground)) { throw ('Worker commit failed: ' + $script:YBgLastError) }
    if ([System.IO.File]::ReadAllText($live) -ne '{"value":"worker"}') { throw 'Worker snapshot was not committed.' }
    $job = New-Snapshot 'conflicted'
    [System.IO.File]::WriteAllText((Join-Path $job.snapshot 'state.json'), '{"value":"stale worker"}')
    [System.IO.File]::WriteAllText($live, '{"value":"recent chat"}')
    $script:YBgJob = $job
    if (Complete-YBackground) { throw 'Stale worker was committed despite a conflict.' }
    if ([System.IO.File]::ReadAllText($live) -ne '{"value":"recent chat"}') { throw 'Concurrent chat was overwritten.' }
    if ($script:YBgConflictCount -ne 1) { throw 'Conflict was not recorded.' }
    if ($null -ne $script:YBgJob) { throw 'Completed job was not disposed.' }
    if (-not (Test-YAsyncApiRoute 'POST' '/api/chat') -or (Test-YAsyncApiRoute 'GET' '/api/status')) {
        throw 'Long AI routes are classified incorrectly.'
    }
    # Real child PowerShell process: API returns a job id without blocking the
    # main writer, then the result becomes available through the polling API.
    $task = Start-YBackground 'GET' '/api/status' ''
    if (-not $task.pending -or -not $task.jobId) { throw 'Async job was not accepted.' }
    if (-not (Get-YApiTask ([string]$task.jobId)).pending) { throw 'Job should initially be pending.' }
    if (-not $script:YBgJob.process.WaitForExit(60000)) { throw 'Child process did not exit.' }
    if (-not (Complete-YBackground)) { throw ('Async worker failed: ' + $script:YBgLastError) }
    $ready = Get-YApiTask ([string]$task.jobId)
    if (-not $ready.ready -or -not [string]$ready.result.provider) { throw 'Async job result missing.' }
    Write-Host 'Background snapshot, conflict and async IPC tests passed.' -ForegroundColor Green
} finally {
    Stop-YBackground
    Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
