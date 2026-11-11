#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $root 'launcher/yaeri-update.ps1') -LibraryOnly

foreach ($remote in @(
    'https://github.com/Aspksa/Yaeri',
    'https://github.com/Aspksa/Yaeri.git',
    'git@github.com:Aspksa/Yaeri.git',
    'ssh://git@github.com/Aspksa/Yaeri.git'
)) {
    if (-not (Test-YAutoRemote $remote)) { throw ('Official GitHub remote rejected: ' + $remote) }
}
foreach ($remote in @(
    '',
    'https://github.com/Other/Yaeri',
    'https://github.com/Aspksa/Yaeri-malicious',
    'https://github.com/Aspksa/Yaeri.git.attacker.invalid',
    'https://evil.example/Aspksa/Yaeri',
    'file:///C:/fake/Yaeri',
    'git@evil.example:Aspksa/Yaeri'
)) {
    if (Test-YAutoRemote $remote) { throw ('Untrusted remote accepted: ' + $remote) }
}

$bat = [System.IO.File]::ReadAllText((Join-Path $root 'Yaeri.bat'))
if ($bat.IndexOf('yaeri-update.ps1', [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $bat.IndexOf('yaeri-update.ps1') -ge $bat.IndexOf('powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%YAERI_SCRIPT%"')) {
    throw 'Updater must be called before the Yaeri server.'
}

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if ($null -eq $git) { throw 'Windows CI requires Git for updater tests.' }
$repo = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-update-check-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($repo)
try {
    function Run-TestGit([string]$CommandLine) {
        $r = Invoke-YAutoGit $CommandLine 10000 $repo ([string]$git.Source)
        if ($r.code -ne 0) { throw ('Git failed: ' + $CommandLine + ' (' + $r.stderr + ')') }
        return $r.stdout
    }
    [void](Run-TestGit 'init -b main')
    [void](Run-TestGit 'config user.name Yaeri-Tests')
    [void](Run-TestGit 'config user.email yaeri-tests@example.invalid')
    [System.IO.File]::WriteAllText((Join-Path $repo 'demo.txt'), 'Initial source')
    [void](Run-TestGit 'add demo.txt')
    [void](Run-TestGit 'commit -m initial')
    $branchName = Run-TestGit 'symbolic-ref --quiet --short HEAD'
    if ($branchName -ne 'main') { throw 'Unexpected test branch name.' }
    $head = Run-TestGit 'rev-parse HEAD'
    [void](Run-TestGit 'merge-base --is-ancestor HEAD HEAD')
    if ($head.Length -ne 40) { throw 'Git SHA parsing failed.' }
    [System.IO.File]::WriteAllText((Join-Path $repo 'demo.txt'), 'Locally edited')
    $dirty = Invoke-YAutoGit 'diff --quiet --' 10000 $repo ([string]$git.Source)
    if ($dirty.code -ne 1) { throw 'Dirty working tree detection failed.' }
    [void](Run-TestGit 'add demo.txt')
    $staged = Invoke-YAutoGit 'diff --cached --quiet --' 10000 $repo ([string]$git.Source)
    if ($staged.code -ne 1) { throw 'Staged edit detection failed.' }
    Write-Host 'Startup updater safety tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $repo -Recurse -Force -ErrorAction SilentlyContinue
}
