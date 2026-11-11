#requires -Version 5.1
# Yaeri: PowerShell HTTP host with mandatory Python and Node.js prerequisites.
$ErrorActionPreference = 'Stop'

try {
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
} catch {
    # Кодировка консоли не мешает работе сервера.
}

# Python and Node.js are mandatory runtimes.
function Assert-YRuntime([string]$Name, [string[]]$Arguments, [int]$MinimumMajor) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) { throw ('Не найден ' + $Name + '. Установите обязательные Python 3 и Node.js и перезапустите Yaeri.') }
    $versionOutput = & $command.Source @Arguments 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '(\d+)\.(\d+)') {
        throw ('Не удалось определить версию ' + $Name + ': ' + $versionOutput.Trim())
    }
    if ([int]$Matches[1] -lt $MinimumMajor -or ($Name -eq 'python' -and [int]$Matches[1] -eq 3 -and [int]$Matches[2] -lt 9)) {
        throw ('Для Yaeri требуется ' + $Name + ' версии ' + $MinimumMajor + '+. Найдено: ' + $versionOutput.Trim())
    }
}
Assert-YRuntime 'python' @('--version') 3
Assert-YRuntime 'node' @('--version') 18
& node (Join-Path $PSScriptRoot '..\node\runtime-check.js')
if ($LASTEXITCODE -ne 0) { throw 'Node.js runtime self-check failed.' }

$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\site'))
$indexFile = Join-Path $siteRoot 'index.html'
$utf8 = [System.Text.UTF8Encoding]::new($false)
$maxBody = 8MB

. (Join-Path $PSScriptRoot 'yaeri-api.ps1')
. (Join-Path $PSScriptRoot 'yaeri-background.ps1')

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

function Send-Json([System.IO.Stream]$Stream, [int]$Code, $Value) {
    $reason = switch ($Code) {
        200 { 'OK' } 400 { 'Bad Request' } 403 { 'Forbidden' } 404 { 'Not Found' }
        405 { 'Method Not Allowed' } 409 { 'Conflict' } 413 { 'Payload Too Large' }
        502 { 'Bad Gateway' } 503 { 'Service Unavailable' } default { 'Internal Server Error' }
    }
    $body = $utf8.GetBytes((ConvertTo-YJson $Value))
    Send-HttpResponse $Stream $Code $reason $body 'application/json; charset=utf-8'
}

function Read-HttpRequest([System.Net.Sockets.TcpClient]$Client, [System.IO.Stream]$Stream) {
    # Читаем заголовки до пустой строки, затем тело по Content-Length.
    $buffer = New-Object byte[] 16384
    $data = New-Object System.IO.MemoryStream
    $headerEnd = -1
    while ($headerEnd -lt 0) {
        $n = $Stream.Read($buffer, 0, $buffer.Length)
        if ($n -le 0) { break }
        # Соединение «ожило»: дальше ждём данные дольше, чем у пустых запасных соединений.
        $Client.ReceiveTimeout = 15000
        $data.Write($buffer, 0, $n)
        $text = [System.Text.Encoding]::ASCII.GetString($data.GetBuffer(), 0, [int]$data.Length)
        $headerEnd = $text.IndexOf("`r`n`r`n")
        if ($headerEnd -lt 0 -and $data.Length -gt 65536) { throw (New-YError 400 'Слишком большие заголовки.') }
    }
    if ($headerEnd -lt 0) { return $null }

    $lines = $text.Substring(0, $headerEnd) -split "`r`n"
    $headers = @{}
    for ($i = 1; $i -lt $lines.Length; $i++) {
        $pos = $lines[$i].IndexOf(':')
        if ($pos -gt 0) { $headers[$lines[$i].Substring(0, $pos).Trim().ToLowerInvariant()] = $lines[$i].Substring($pos + 1).Trim() }
    }

    $length = 0
    if ($headers.ContainsKey('content-length')) {
        if (-not [int]::TryParse($headers['content-length'], [ref]$length) -or $length -lt 0) {
            throw (New-YError 400 'Некорректный Content-Length.')
        }
    }
    if ($length -gt $maxBody) { throw (New-YError 413 'Слишком большой запрос.') }

    $bodyStart = $headerEnd + 4
    while ($data.Length -lt $bodyStart + $length) {
        $n = $Stream.Read($buffer, 0, $buffer.Length)
        if ($n -le 0) { break }
        $data.Write($buffer, 0, $n)
    }
    $bodyText = ''
    if ($length -gt 0) {
        $available = [Math]::Min($length, [int]$data.Length - $bodyStart)
        $bodyText = $utf8.GetString($data.GetBuffer(), $bodyStart, $available)
    }
    return @{ Line = $lines[0]; Headers = $headers; Body = $bodyText }
}

$listener = $null
try {
    if (-not (Test-Path -LiteralPath $indexFile -PathType Leaf)) {
        throw 'Не найден сайт: site\index.html'
    }

    Import-YConfig
    Import-YStore
    Clear-YBackgroundOrphans

    Write-Host ''
    if (-not (Test-YConfigured)) {
        # Ключ вводится на сайте: ⚙ Настройки → Подключение. Он сохранится в config\yaeri.config.json.
        Write-Host 'API-ключ Cloud.ru пока не задан: Яэри откроется в демо-режиме.' -ForegroundColor Yellow
        Write-Host 'Вставьте ключ на сайте: шестерёнка «Настройки» → «Подключение». Перезапуск не нужен.'
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
    if (Test-YConfigured) {
        Write-Host ('AI: Cloud.ru, модель по умолчанию ' + $script:Config.chatModel) -ForegroundColor Green
    } else {
        Write-Host 'AI: не подключён (демо-режим).' -ForegroundColor Yellow
    }
    Write-Host ('Данные: ' + $script:DataDir)
    Write-Host 'Для остановки закройте это окно или нажмите Ctrl+C.'
    Write-Host ''

    try {
        Start-Process -FilePath $address -ErrorAction Stop
    } catch {
        Write-Host 'Не удалось открыть браузер автоматически.' -ForegroundColor Yellow
        Write-Host ('Откройте адрес вручную: ' + $address)
    }

    # Slow model work runs in a disposable child process while HTTP remains
    # responsive. The main loop alone commits validated JSON snapshots.
    $lastEvolutionPoll = 0L
    while ($true) {
        if ($null -ne $script:YBgJob) { [void](Complete-YBackground) }
        if (-not $listener.Pending()) {
            $clock = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            if ($clock - $lastEvolutionPoll -ge 120000) {
                $lastEvolutionPoll = $clock
                [void](Start-YBackground)
            }
            Start-Sleep -Milliseconds 100
            continue
        }
        $client = $listener.AcceptTcpClient()
        $stream = $null
        try {
            # Браузеры открывают «запасные» пустые соединения; короткий таймаут
            # не даёт им надолго задерживать загрузку страницы.
            $client.ReceiveTimeout = 1000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            try {
                $request = Read-HttpRequest $client $stream
            } catch [YaeriHttpException] {
                Send-Json $stream $_.Exception.Code @{ error = $_.Exception.Message }
                continue
            }
            if ($null -eq $request -or [string]::IsNullOrWhiteSpace($request.Line)) {
                continue
            }

            if ($request.Line -notmatch '^(GET|HEAD|POST) (\S+) HTTP/1\.[01]$') {
                $body = $utf8.GetBytes('Метод не поддерживается.')
                Send-HttpResponse $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8'
                continue
            }

            $method = $Matches[1]
            $target = $Matches[2]
            $pathPart = ($target -split '\?', 2)[0]

            # ---------- API ----------
            if ($pathPart.StartsWith('/api/')) {
                # Защита: только запросы со страницы самой Яэри (подробности в Get-YRequestBlockReason).
                $blockReason = Get-YRequestBlockReason $method $request.Headers
                if ($blockReason) {
                    Write-Host ('Отклонён запрос ' + $method + ' ' + $pathPart + ': ' + $blockReason +
                        ' (Host: ' + [string]$request.Headers['host'] + ', Origin: ' + [string]$request.Headers['origin'] + ')') -ForegroundColor Yellow
                    Send-Json $stream 403 @{ error = ('Запрос отклонён: ' + $blockReason + '. Откройте Яэри по адресу ' + $address) }
                    continue
                }
                if ($method -eq 'HEAD') {
                    Send-Json $stream 405 @{ error = 'Метод не поддерживается.' }
                    continue
                }
                $client.SendTimeout = 30000
                try {
                    if ($method -eq 'GET' -and $pathPart -match '^/api/jobs/([a-f0-9]{32})$') {
                        $result = Get-YApiTask $Matches[1]
                    } elseif (Test-YAsyncApiRoute $method $pathPart) {
                        $result = Start-YApiTask $method $pathPart $request.Body
                    } else {
                        $result = Invoke-YApi $method $pathPart $request.Body
                    }
                    Send-Json $stream 200 $result
                } catch [YaeriHttpException] {
                    Send-Json $stream $_.Exception.Code @{ error = $_.Exception.Message }
                } catch {
                    Write-Host ('Ошибка API: ' + $_.Exception.Message) -ForegroundColor Yellow
                    Send-Json $stream 500 @{ error = ('Внутренняя ошибка: ' + $_.Exception.Message) }
                }
                continue
            }

            # ---------- Статические файлы ----------
            if ($method -eq 'POST') {
                $body = $utf8.GetBytes('Метод не поддерживается.')
                Send-HttpResponse $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8'
                continue
            }
            $decoded = [System.Uri]::UnescapeDataString($pathPart)
            if ($decoded -eq '/') { $decoded = '/index.html' }
            $headOnly = ($method -eq 'HEAD')
            $relative = $decoded.TrimStart([char]47).Replace([char]47, [char]92)
            try {
                $file = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relative))
            } catch {
                # Недопустимые символы в пути (например, «:» или «|»).
                $body = $utf8.GetBytes('Некорректный адрес.')
                Send-HttpResponse $stream 400 'Bad Request' $body 'text/plain; charset=utf-8' $headOnly
                continue
            }
            $allowedPrefix = $siteRoot.TrimEnd([char]92) + [System.IO.Path]::DirectorySeparatorChar
            $isAllowed = $file.StartsWith(
                $allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase
            )

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
        } catch [System.IO.IOException] {
            # Таймаут или обрыв соединения (пустое «запасное» соединение браузера).
        } catch {
            Write-Host ('Ошибка запроса: ' + $_.Exception.Message) -ForegroundColor Yellow
        } finally {
            $client.Dispose()
        }
    }
} catch {
    Write-Host ('Ошибка запуска Яэри: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    Stop-YBackground
    if ($null -ne $listener) { $listener.Stop() }
}
