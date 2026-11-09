#requires -Version 5.1
# Yaeri: локальный сайт без Python и без установки зависимостей.
$ErrorActionPreference = 'Stop'

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {
    # Кодировка консоли не мешает работе сервера.
}

$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\site'))
$indexFile = Join-Path $siteRoot 'index.html'
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Send-HttpResponse {
    param(
        [System.IO.Stream]$Stream,
        [int]$Code,
        [string]$Reason,
        [byte[]]$Body,
        [string]$ContentType,
        [bool]$HeadOnly = $false
    )

    $crlf = [string][char]13 + [string][char]10
    $header = 'HTTP/1.1 ' + $Code + ' ' + $Reason + $crlf +
        'Content-Type: ' + $ContentType + $crlf +
        'Content-Length: ' + $Body.Length + $crlf +
        'Connection: close' + $crlf +
        'Cache-Control: no-store' + $crlf +
        'X-Content-Type-Options: nosniff' + $crlf + $crlf

    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if (-not $HeadOnly) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

$listener = $null
try {
    if (-not (Test-Path -LiteralPath $indexFile -PathType Leaf)) {
        throw 'Не найден сайт: site\index.html'
    }

    # 127.0.0.1: только текущий компьютер. Порт 0 выбирается системой.
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback, 0
    )
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $address = 'http://127.0.0.1:' + $port + '/'

    Write-Host ''
    Write-Host 'Яэри запущена!' -ForegroundColor Magenta
    Write-Host ('Адрес сайта: ' + $address) -ForegroundColor Cyan
    Write-Host 'Порт выбран автоматически. Python не нужен.'
    Write-Host 'Для остановки закройте это окно или нажмите Ctrl+C.'
    Write-Host ''

    try {
        Start-Process -FilePath $address -ErrorAction Stop
    } catch {
        Write-Host 'Не удалось открыть браузер автоматически.' -ForegroundColor Yellow
        Write-Host ('Откройте адрес вручную: ' + $address)
    }

    while ($true) {
        $client = $listener.AcceptTcpClient()
        $reader = $null
        try {
            $client.ReceiveTimeout = 5000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new(
                $stream, [System.Text.Encoding]::ASCII, $false, 1024, $true
            )
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) {
                continue
            }

            # Прочитать заголовки запроса до пустой строки.
            for ($i = 0; $i -lt 100; $i++) {
                $line = $reader.ReadLine()
                if ($null -eq $line -or $line.Length -eq 0) { break }
            }

            if ($requestLine -notmatch '^(GET|HEAD) (\S+) HTTP/1\.[01]$') {
                $body = $utf8.GetBytes('Метод не поддерживается.')
                Send-HttpResponse $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8'
                continue
            }

            $method = $Matches[1]
            $target = $Matches[2]
            $pathPart = ($target -split '\?', 2)[0]
            $decoded = [System.Uri]::UnescapeDataString($pathPart)
            if ($decoded -eq '/') { $decoded = '/index.html' }
            $relative = $decoded.TrimStart('/').Replace('/', '\')
            $file = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relative))
            $allowedPrefix = $siteRoot.TrimEnd('\') + [System.IO.Path]::DirectorySeparatorChar
            $isAllowed = $file.StartsWith(
                $allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase
            )
            $headOnly = ($method -eq 'HEAD')

            if (-not $isAllowed) {
                $body = $utf8.GetBytes('Доступ запрещён.')
                Send-HttpResponse $stream 403 'Forbidden' $body 'text/plain; charset=utf-8' $headOnly
                continue
            }
            if (-not [System.IO.File]::Exists($file)) {
                $body = $utf8.GetBytes('Страница не найдена.')
                Send-HttpResponse $stream 404 'Not Found' $body 'text/plain; charset=utf-8' $headOnly
                continue
            }

            $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
            $type = switch ($extension) {
                '.html' { 'text/html; charset=utf-8' }
                '.css'  { 'text/css; charset=utf-8' }
                '.js'   { 'application/javascript; charset=utf-8' }
                '.json' { 'application/json; charset=utf-8' }
                '.svg'  { 'image/svg+xml' }
                '.png'  { 'image/png' }
                '.webp' { 'image/webp' }
                '.ico'  { 'image/x-icon' }
                default { 'application/octet-stream' }
            }
            $body = [System.IO.File]::ReadAllBytes($file)
            Send-HttpResponse $stream 200 'OK' $body $type $headOnly
        } catch {
            Write-Host ('Ошибка запроса: ' + $_.Exception.Message) -ForegroundColor Yellow
        } finally {
            if ($null -ne $reader) { $reader.Dispose() }
            $client.Dispose()
        }
    }
} catch {
    Write-Host ('Ошибка запуска Яэри: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $listener) { $listener.Stop() }
}
