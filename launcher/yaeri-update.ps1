#requires -Version 5.1
# Safe, bounded startup updates for git clones of Aspksa/Yaeri.
# No forced reset, no merges of divergent histories, no deletion of personal data.
param([switch]$LibraryOnly)
$ErrorActionPreference = 'Stop'

function Test-YAutoRemote([string]$Url) {
    $value = ([string]$Url).Trim()
    return ($value -match '(?i)^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)Aspksa/Yaeri(?:\.git)?/?$')
}

function Invoke-YAutoGit(
    [string]$Arguments,
    [int]$TimeoutMs = 12000,
    [string]$Root = '',
    [string]$Exe = ''
) {
    if (-not $Root) { $Root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
    if (-not $Exe) { $Exe = $script:YAutoGitExe }
    if (-not $Exe) { throw 'Git executable is missing.' }
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = $Exe
    $info.Arguments = $Arguments
    $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['GIT_TERMINAL_PROMPT'] = '0'
    $info.EnvironmentVariables['GCM_INTERACTIVE'] = 'never'

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $info
    try {
        [void]$process.Start()
        if (-not $process.WaitForExit($TimeoutMs)) {
            try { $process.Kill(); [void]$process.WaitForExit(2000) } catch { }
            return @{ code = 124; stdout = ''; stderr = 'Превышено время ожидания Git.' }
        }
        return @{
            code = [int]$process.ExitCode
            stdout = $process.StandardOutput.ReadToEnd().Trim()
            stderr = $process.StandardError.ReadToEnd().Trim()
        }
    } finally {
        $process.Dispose()
    }
}

function Start-YAutoUpdate {
    $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $git = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($null -eq $git) {
        Write-Host 'Автообновление: Git не установлен; запускаю текущую версию.' -ForegroundColor DarkYellow
        return 'no-git'
    }
    $script:YAutoGitExe = [string]$git.Source
    try {
        $repo = Invoke-YAutoGit 'rev-parse --show-toplevel'
        if ($repo.code -ne 0) {
            Write-Host 'Автообновление: это не Git-клон; для обновлений через Git потребуется клонировать репозиторий.' -ForegroundColor DarkYellow
            return 'not-clone'
        }
        $top = [System.IO.Path]::GetFullPath($repo.stdout.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not [string]::Equals($top.TrimEnd('\'), $root.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host 'Автообновление пропущено: папка Yaeri не является корнем Git-репозитория.' -ForegroundColor DarkYellow
            return 'not-root'
        }
        $branch = Invoke-YAutoGit 'symbolic-ref --quiet --short HEAD'
        if ($branch.code -ne 0 -or $branch.stdout -cne 'main') {
            Write-Host 'Автообновление пропущено: обновляется только ветка main.' -ForegroundColor DarkYellow
            return 'wrong-branch'
        }
        $remote = Invoke-YAutoGit 'remote get-url origin'
        if ($remote.code -ne 0 -or -not (Test-YAutoRemote $remote.stdout)) {
            Write-Host 'Автообновление пропущено: origin не указывает на Aspksa/Yaeri.' -ForegroundColor DarkYellow
            return 'wrong-remote'
        }

        # Never update a working tree containing tracked edits or staged changes.
        # Untracked files are never deleted; Git will refuse a conflicting merge.
        $unstaged = Invoke-YAutoGit 'diff --quiet --'
        $staged = Invoke-YAutoGit 'diff --cached --quiet --'
        if ($unstaged.code -ne 0 -or $staged.code -ne 0) {
            Write-Host 'Автообновление пропущено: есть локальные изменения в отслеживаемых файлах. Они сохранены.' -ForegroundColor DarkYellow
            return 'local-edits'
        }

        Write-Host 'Яэри проверяет обновления в GitHub…' -ForegroundColor Cyan
        $fetch = Invoke-YAutoGit 'fetch --quiet --no-tags origin main' 25000
        if ($fetch.code -ne 0) {
            Write-Host 'Не удалось проверить обновления (нет сети или Git недоступен). Запускаю текущую версию.' -ForegroundColor DarkYellow
            return 'offline'
        }
        $head = Invoke-YAutoGit 'rev-parse HEAD'
        $latest = Invoke-YAutoGit 'rev-parse FETCH_HEAD'
        if ($head.code -ne 0 -or $latest.code -ne 0) { return 'git-error' }
        if ($head.stdout -eq $latest.stdout) {
            Write-Host 'Яэри уже обновлена.' -ForegroundColor DarkGreen
            return 'up-to-date'
        }

        # Fast-forward only: never discard local commits, never create merge commits.
        $ancestor = Invoke-YAutoGit 'merge-base --is-ancestor HEAD FETCH_HEAD'
        if ($ancestor.code -ne 0) {
            Write-Host 'Автообновление пропущено: история ветки разошлась с GitHub. Локальные коммиты сохранены.' -ForegroundColor DarkYellow
            return 'diverged'
        }
        # Recheck working-tree cleanliness immediately before changing files.
        if ((Invoke-YAutoGit 'diff --quiet --').code -ne 0 -or
            (Invoke-YAutoGit 'diff --cached --quiet --').code -ne 0) {
            Write-Host 'Автообновление пропущено: обнаружены локальные правки.' -ForegroundColor DarkYellow
            return 'local-edits'
        }
        $merged = Invoke-YAutoGit 'merge --ff-only FETCH_HEAD' 20000
        if ($merged.code -ne 0) {
            Write-Host 'Git не смог безопасно применить обновление. Запускаю текущую версию.' -ForegroundColor DarkYellow
            return 'merge-failed'
        }
        Write-Host ('Яэри обновлена: ' + $head.stdout.Substring(0, 8) + ' → ' + $latest.stdout.Substring(0, 8)) -ForegroundColor Green
        return 'updated'
    } catch {
        Write-Host ('Не удалось автоматически обновить Яэри: ' + $_.Exception.Message) -ForegroundColor DarkYellow
        return 'error'
    }
}

if (-not $LibraryOnly) {
    # Printing the status is useful only for test code; the user sees the message.
    [void](Start-YAutoUpdate)
}
