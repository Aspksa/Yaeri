#requires -Version 5.1
$ErrorActionPreference = 'Stop'
function Test-YExecutable([string]$Name, [string]$Argument, [int]$MinMajor) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) { return $false }
    try {
        $out = (& $command.Source $Argument 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0 -or $out -notmatch '(\d+)\.(\d+)') { return $false }
        if ([int]$Matches[1] -lt $MinMajor) { return $false }
        if ($Name -eq 'python' -and [int]$Matches[1] -eq 3 -and [int]$Matches[2] -lt 9) { return $false }
        return $true
    } catch { return $false }
}
function Refresh-YPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $machine + ';' + $user
}
$missing = @()
if (-not (Test-YExecutable 'python' '--version' 3)) { $missing += @{ name='Python'; id='Python.Python.3.11' } }
if (-not (Test-YExecutable 'node' '--version' 18)) { $missing += @{ name='Node.js'; id='OpenJS.NodeJS.LTS' } }
if ($missing.Count -eq 0) { exit 0 }
if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
    Write-Error 'Для автоматической установки Python и Node.js требуется winget (Windows App Installer).'
    exit 1
}
foreach ($item in $missing) {
    Write-Host ('Устанавливаю ' + $item.name + ' через winget...')
    & winget.exe install --exact --id $item.id --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw ('Не удалось установить ' + $item.name + ' через winget.') }
}
Refresh-YPath
if (-not (Test-YExecutable 'python' '--version' 3) -or -not (Test-YExecutable 'node' '--version' 18)) {
    throw 'Рантаймы установлены, но команды пока недоступны. Перезапустите Yaeri.bat.'
}
exit 0
