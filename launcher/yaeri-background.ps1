#requires -Version 5.1
# Separate-process background engine. Never writes live JSON from a worker.
# The main HTTP thread alone applies a validated snapshot (optimistic commit).
$script:YBgJob = $null
$script:YBgLastError = ''
$script:YBgLastRun = 0L
$script:YBgConflictCount = 0

function Get-YBgHash([string]$Path) {
    if (-not [System.IO.File]::Exists($Path)) { return '<missing>' }
    return [string](Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}
function Get-YBgFiles([string]$Folder) {
    $out = @{}
    if ([System.IO.Directory]::Exists($Folder)) {
        foreach ($file in (Get-ChildItem -LiteralPath $Folder -File -Filter '*.json')) {
            $out[$file.Name] = Get-YBgHash $file.FullName
        }
    }
    return $out
}
function Start-YBackground {
    if ($null -ne $script:YBgJob) { return $false }
    # No model calls are made if Cloud.ru is not configured, except local
    # commitment reminders when explicitly opted in.
    if (-not (Test-YConfigured) -and -not [bool]$script:Y3.initiative) { return $false }
    $base = Join-Path $script:DataDir ('.bg-work-' + [guid]::NewGuid().ToString('N'))
    $snapshot = Join-Path $base 'snapshot'
    [void][System.IO.Directory]::CreateDirectory($snapshot)
    try {
        foreach ($file in (Get-ChildItem -LiteralPath $script:DataDir -File -Filter '*.json')) {
            Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $snapshot $file.Name)
        }
        $original = Get-YBgFiles $snapshot
        $worker = Join-Path $PSScriptRoot 'yaeri-background-worker.ps1'
        $stdout = Join-Path $base 'stdout.log'
        $stderr = Join-Path $base 'stderr.log'
        $args = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $worker + '" -SnapshotDir "' + $snapshot + '"'
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $script:YBgJob = @{ process = $process; base = $base; snapshot = $snapshot; original = $original }
        $script:YBgLastRun = Get-YNow
        return $true
    } catch {
        $script:YBgLastError = $_.Exception.Message
        if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue }
        return $false
    }
}
function Complete-YBackground {
    $job = $script:YBgJob
    if ($null -eq $job) { return $false }
    $proc = $job.process
    $proc.Refresh()
    if (-not $proc.HasExited) { return $false }
    $script:YBgJob = $null
    try {
        if ($proc.ExitCode -ne 0) {
            $errPath = Join-Path $job.base 'stderr.log'
            $detail = if (Test-Path -LiteralPath $errPath) { [System.IO.File]::ReadAllText($errPath) } else { '' }
            throw ('Background worker failed (' + $proc.ExitCode + '): ' + $detail.Substring(0, [Math]::Min(300, $detail.Length)))
        }
        $produced = Get-YBgFiles $job.snapshot
        $changed = New-Object System.Collections.Generic.List[string]
        # Both changed files AND their original versions are checked before
        # committing anything; a concurrent chat cannot be overwritten.
        foreach ($name in @($produced.Keys)) {
            $before = if ($job.original.ContainsKey($name)) { $job.original[$name] } else { '<missing>' }
            if ($produced[$name] -eq $before) { continue }
            $livePath = Join-Path $script:DataDir $name
            if ((Get-YBgHash $livePath) -ne $before) {
                $script:YBgConflictCount++
                throw ('Background snapshot conflict in ' + $name + '; will retry from fresh data.')
            }
            $changed.Add($name)
        }
        foreach ($name in $changed) {
            $from = Join-Path $job.snapshot $name
            $to = Join-Path $script:DataDir $name
            $tmp = $to + '.bg-tmp'
            [System.IO.File]::WriteAllBytes($tmp, [System.IO.File]::ReadAllBytes($from))
            if ([System.IO.File]::Exists($to)) {
                [System.IO.File]::Replace($tmp, $to, [System.Management.Automation.Language.NullString]::Value)
            } else {
                [System.IO.File]::Move($tmp, $to)
            }
        }
        if ($changed.Count -gt 0) { Import-YStore }
        $script:YBgLastError = ''
        return $true
    } catch {
        $script:YBgLastError = $_.Exception.Message
        Write-Host ('Фоновая задача: ' + $script:YBgLastError) -ForegroundColor Yellow
        return $false
    } finally {
        try { $proc.Dispose() } catch { }
        Remove-Item -LiteralPath $job.base -Recurse -Force -ErrorAction SilentlyContinue
    }
}
function Stop-YBackground {
    if ($null -eq $script:YBgJob) { return }
    try {
        $proc = $script:YBgJob.process
        $proc.Refresh()
        if (-not $proc.HasExited) { $proc.Kill(); $proc.WaitForExit(5000) | Out-Null }
        $proc.Dispose()
    } catch { }
    Remove-Item -LiteralPath $script:YBgJob.base -Recurse -Force -ErrorAction SilentlyContinue
    $script:YBgJob = $null
}
function Clear-YBackgroundOrphans {
    if (-not (Test-Path -LiteralPath $script:DataDir)) { return }
    foreach ($dir in (Get-ChildItem -LiteralPath $script:DataDir -Directory -Filter '.bg-work-*')) {
        Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}
