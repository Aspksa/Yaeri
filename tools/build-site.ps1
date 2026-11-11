#requires -Version 5.1
# Build the browser bundle without Node.js or external dependencies.
param([switch]$Check)
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifest = [System.IO.File]::ReadAllText((Join-Path $root 'site/src/manifest.json')) | ConvertFrom-Json
$out = [System.IO.Path]::GetFullPath((Join-Path $root $manifest.output))
$sb = New-Object System.Text.StringBuilder
foreach ($src in $manifest.sources) {
    $file = [System.IO.Path]::GetFullPath((Join-Path $root ([string]$src)))
    if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe manifest path.' }
    [void]$sb.Append([System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8))
}
$built = $sb.ToString()
if ($Check) {
    if (-not [System.IO.File]::Exists($out) -or [System.IO.File]::ReadAllText($out, [System.Text.Encoding]::UTF8) -cne $built) {
        throw 'site/js/app.js is not up to date. Run tools/build-site.ps1.'
    }
    Write-Host 'Browser bundle is up to date.'
} else {
    [System.IO.File]::WriteAllText($out, $built, [System.Text.UTF8Encoding]::new($false))
    Write-Host 'Built site/js/app.js.'
}
