#requires -Version 5.1
# Long API/model tasks run in a child process against an isolated JSON snapshot.
# The HTTP thread remains responsive and is the ONLY writer to live JSON files.
# Optimistic, all-or-nothing conflict checks prevent overwriting newer changes.
$script:YBgJob = $null
$script:YBgLastError = ''
$script:YBgLastRun = 0L
$script:YBgConflictCount = 0
$script:YApiJobs = @{}
$script:YLastChatAt = 0L
$script:YBgChatQuietMs = 180000   # фоновые размышления не начинаются, пока хозяин пишет в чат
$script:YApiJobKeepMs = 900000    # готовые результаты AI-задач хранятся 15 минут

function Clear-YApiJobs {
    $now = Get-YNow
    foreach ($id in @($script:YApiJobs.Keys)) {
        $job = $script:YApiJobs[$id]
        if ([string]$job.status -ne 'pending' -and $now - [long]$job.t -gt $script:YApiJobKeepMs) { $script:YApiJobs.Remove($id) }
    }
}

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
function Test-YAsyncApiRoute([string]$Method, [string]$Path) {
    return @(
        'POST /api/chat', 'GET /api/models', 'POST /api/models/refresh',
        'POST /api/config/test', 'POST /api/docs', 'POST /api/reindex',
        'POST /api/vector/search', 'POST /api/life/local/test',
        'POST /api/evolution5/research',
        'POST /api/soul/reflect', 'POST /api/soul/sleep',
        'POST /api/soul/care', 'POST /api/soul/share',
        'POST /api/soul3/plans', 'POST /api/soul/growth/run',
        'POST /api/soul/depth/run', 'POST /api/soul/depth/skill/test',
        'POST /api/soul/free/run'
    ) -contains ($Method + ' ' + $Path)
}
function Start-YBackground([string]$Method = '', [string]$Path = '', [string]$Body = '') {
    if ($null -ne $script:YBgJob) { return $false }
    $isApi = [bool]$Method
    $localCycle=[bool]($script:YE5.enabled -and $script:YE5.periodic)
    if (-not $isApi -and [bool]$script:YLife.offline -and -not $localCycle) { return $false }
    # Хозяин сейчас пишет: тик всё равно был бы прерван его следующим сообщением,
    # а оплаченные запросы к модели пропали бы вместе со снимком (и мимо дневного лимита).
    if (-not $isApi -and (Get-YNow) - [long]$script:YLastChatAt -lt $script:YBgChatQuietMs) { return $false }
    if (-not $isApi -and -not (Test-YConfigured) -and -not [bool]$script:Y3.initiative -and -not $localCycle) { return $false }
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
        $id = ''
        $resultFile = Join-Path $base 'result.json'
        $args += ' -ResultFile "' + $resultFile + '"'
        if ($isApi) {
            $id = [guid]::NewGuid().ToString('N')
            $requestFile = Join-Path $base 'request.json'
            [System.IO.File]::WriteAllText($requestFile, (ConvertTo-YJson @{ method = $Method; path = $Path; body = $Body }), $script:Utf8)
            $args += ' -RequestFile "' + $requestFile + '"'
        }
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $args -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
        $script:YBgJob = @{
            process = $process; base = $base; snapshot = $snapshot
            original = $original; kind = $(if ($isApi) { 'api' } else { 'tick' })
            id = $id; resultFile = $resultFile
        }
        $script:YBgLastRun = Get-YNow
        if ($isApi) {
            $script:YApiJobs[$id] = @{ status = 'pending'; t = (Get-YNow) }
            return @{ pending = $true; jobId = $id }
        }
        return $true
    } catch {
        $script:YBgLastError = $_.Exception.Message
        if (Test-Path -LiteralPath $base) { Remove-Item -LiteralPath $base -Recurse -Force -ErrorAction SilentlyContinue }
        if ($isApi) { throw (New-YError 503 ('Не удалось запустить AI-задачу: ' + $script:YBgLastError)) }
        return $false
    }
}
function Start-YApiTask([string]$Method, [string]$Path, [string]$Body) {
    if (-not (Test-YAsyncApiRoute $Method $Path)) { throw (New-YError 404 'Неизвестная AI-задача.') }
    Clear-YApiJobs
    if ($Method -eq 'POST' -and $Path -eq '/api/chat') { $script:YLastChatAt = Get-YNow }
    if ($null -ne $script:YBgJob) {
        # User requests take precedence; an uncommitted background snapshot is
        # safe to discard because it has never touched live files.
        if ([string](Get-YValue $script:YBgJob 'kind' 'tick') -eq 'tick') { Stop-YBackground }
        else { throw (New-YError 409 'Другая длительная AI-задача ещё выполняется.') }
    }
    return Start-YBackground $Method $Path $Body
}
function Get-YApiTask([string]$Id) {
    if (-not $script:YApiJobs.ContainsKey($Id)) { throw (New-YError 404 'AI-задача не найдена или срок хранения истёк.') }
    $job = $script:YApiJobs[$Id]
    switch ([string]$job.status) {
        'done' { return @{ ready = $true; result = $job.result } }
        'error' { throw (New-YError 502 ([string]$job.error)) }
        default { return @{ pending = $true; jobId = $Id } }
    }
}
function Complete-YBackground {
    $job = $script:YBgJob
    if ($null -eq $job) { return $false }
    $proc = $job.process
    $proc.Refresh()
    if (-not $proc.HasExited) { return $false }
    $script:YBgJob = $null
    $kind = [string](Get-YValue $job 'kind' 'tick')
    try {
        $packet = $null
        $resultPath = [string](Get-YValue $job 'resultFile' '')
        if ($resultPath) {
            $packet = Read-YJsonFile $resultPath
            if ($null -eq $packet -or -not [bool](Get-YValue $packet 'ok' $false)) {
                $message = [string](Get-YValue $packet 'error' 'AI-задача завершилась без отметки об успехе.')
                throw $message
            }
        }
        if ($null -ne $proc.ExitCode -and [int]$proc.ExitCode -ne 0) {
            $errPath = Join-Path $job.base 'stderr.log'
            $detail = if (Test-Path -LiteralPath $errPath) { [System.IO.File]::ReadAllText($errPath) } else { '' }
            throw ('Background worker failed (' + $proc.ExitCode + '): ' + $detail.Substring(0, [Math]::Min(300, $detail.Length)))
        }
        $produced = Get-YBgFiles $job.snapshot
        $changed = New-Object System.Collections.Generic.List[string]
        # Check EVERY changed file before writing ANY of them.
        foreach ($name in @($produced.Keys)) {
            $before = if ($job.original.ContainsKey($name)) { $job.original[$name] } else { '<missing>' }
            if ($produced[$name] -eq $before) { continue }
            $livePath = Join-Path $script:DataDir $name
            if ((Get-YBgHash $livePath) -ne $before) {
                $script:YBgConflictCount++
                throw ('Память изменилась во время AI-задачи (' + $name + '). Повторите запрос.')
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
        if ($kind -eq 'api') { $script:YApiJobs[[string]$job.id] = @{ status = 'done'; t = (Get-YNow); result = (Get-YValue $packet 'response' @{}) } }
        $script:YBgLastError = ''
        return $true
    } catch {
        $script:YBgLastError = $_.Exception.Message
        if ($kind -eq 'api') {
            $script:YApiJobs[[string]$job.id] = @{ status = 'error'; t = (Get-YNow); error = $script:YBgLastError }
        }
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
        # Do not remove a worker belonging to another instance still running.
        if ($dir.LastWriteTime -lt [datetime]::Now.AddDays(-1)) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
