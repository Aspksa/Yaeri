#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $root 'launcher/yaeri-api.ps1')
try {
    $ok = @(
        @('GET',  @{ host = '127.0.0.1:5123' }),
        @('GET',  @{ host = 'localhost:5123'; 'sec-fetch-site' = 'same-origin' }),
        @('GET',  @{ host = 'LOCALHOST:5123'; origin = 'http://localhost:5123' }),
        @('GET',  @{ host = '[::1]:5123' }),
        @('GET',  @{ host = '127.0.0.1:8080'; origin = 'http://127.0.0.1:5123' }),
        @('POST', @{ host = '127.0.0.1:5123'; origin = 'http://127.0.0.1:5123'; 'content-type' = 'application/json' }),
        @('POST', @{ host = '127.0.0.1:5123'; origin = 'null'; 'content-type' = 'application/json; charset=utf-8' }),
        @('GET',  @{ host = '127.0.0.1:5123'; 'sec-fetch-site' = 'none' })
    )
    foreach ($case in $ok) {
        $why = Get-YRequestBlockReason $case[0] $case[1]
        if ($why) { throw ('Allowed request was rejected: ' + ($case[1] | ConvertTo-Json -Compress) + ' -> ' + $why) }
    }
    $bad = @(
        @('GET',  @{ }),
        @('GET',  @{ host = 'evil.example:5123' }),
        @('GET',  @{ host = '127.0.0.1.evil.example' }),
        @('GET',  @{ host = '127.0.0.1:5123'; origin = 'https://evil.example' }),
        @('GET',  @{ host = '127.0.0.1:5123'; 'sec-fetch-site' = 'cross-site' }),
        @('POST', @{ host = '127.0.0.1:5123'; 'content-type' = 'text/plain' }),
        @('POST', @{ host = '127.0.0.1:5123' })
    )
    foreach ($case in $bad) {
        $why = Get-YRequestBlockReason $case[0] $case[1]
        if (-not $why) { throw ('Foreign request was allowed: ' + ($case[1] | ConvertTo-Json -Compress)) }
    }
    Write-Host 'Local request guard tests passed.' -ForegroundColor Green
} catch {
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
