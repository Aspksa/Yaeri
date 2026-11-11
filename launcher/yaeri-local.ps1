#requires -Version 5.1
# Offline Yaeri: built-in memory replies, plus optional local llama.cpp GGUF server.
# No external service is needed for memory-only mode. No downloads are performed.
# LLM requests, when enabled, only target 127.0.0.1:9931, never Cloud.ru.
$script:YLocalLastBackend = 'memory-only'

function Invoke-YLocalLlama([string]$Endpoint, $Payload = $null) {
    if (@('health','chat') -notcontains $Endpoint) { throw (New-YError 400 'Недопустимая локальная операция.') }
    $relative = $(if ($Endpoint -eq 'health') { '/health' } else { '/v1/chat/completions' })
    $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:9931' + $relative)
    $request.Proxy = [System.Net.GlobalProxySelection]::GetEmptyWebProxy()
    $request.AllowAutoRedirect = $false
    $request.Timeout = $(if ($Endpoint -eq 'health') { 1200 } else { 180000 })
    $request.ReadWriteTimeout = $(if ($Endpoint -eq 'health') { 1200 } else { 180000 })
    $request.Accept = 'application/json'
    $request.Method = $(if ($Endpoint -eq 'health') { 'GET' } else { 'POST' })
    if ($Endpoint -eq 'chat') {
        $bytes = $script:Utf8.GetBytes((ConvertTo-YJson $Payload))
        $request.ContentType = 'application/json; charset=utf-8'
        $request.ContentLength = $bytes.Length
        $stream = $request.GetRequestStream()
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    $response = $null
    try { $response = $request.GetResponse() }
    catch { throw (New-YError 503 ('Локальный GGUF-сервер недоступен: ' + $_.Exception.Message)) }
    try {
        if ([int]$response.StatusCode -ne 200) { throw (New-YError 502 'Локальный сервер вернул ошибку.') }
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), $script:Utf8)
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
        return ,(ConvertFrom-YJson $text)
    } finally { $response.Dispose() }
}
function Test-YLocalEngine {
    try {
        $health = Invoke-YLocalLlama 'health'
        if ([string](Get-YValue $health 'status' '') -ne 'ok') { throw 'Модель ещё загружается.' }
        return @{
            ok = $true; backend = 'llama.cpp'; generative = $true
            endpoint = '127.0.0.1:9931'; error = ''
        }
    } catch {
        return @{
            ok = $true; backend = 'memory-only'; generative = $false
            endpoint = 'local PowerShell'; error = 'GGUF-модель не запущена. Встроенный поиск по памяти доступен. Для генерации можно отдельно запустить llama.cpp.'
        }
    }
}
function Get-YOfflineReply([string]$Query) {
    $q = ([string]$Query).Trim()
    if (-not $q) { return 'Напиши, что ты хотел бы вспомнить.' }
    if ($q -match '(?i)^(привет|здравствуй|добрый день|доброе утро|добрый вечер|эй яэри)[!.\s]*$') {
        return 'Привет! Я здесь, в автономном режиме. Могу поговорить короткими фразами, найти сохранённое воспоминание или показать наши планы. Для свободной генерации нужна локальная GGUF-модель.'
    }
    if ($q -match '(?i)как (ты|дела)|что нового') {
        return 'Сейчас я работаю без интернета. Моя память и планы доступны, но без запущенной локальной языковой модели я не умею свободно поддерживать разговор.'
    }
    if (-not (Test-YTopicVisible $q)) {
        return 'Эта тема закрыта настройками приватности памяти, поэтому я не буду её искать.'
    }
    if ($q -match '(?i)план|дела|задач|обещан') {
        $plans = @($script:Y3.plans | Where-Object {
            [string]$_.status -eq 'active' -and (Test-YTopicVisible ([string]$_.goal))
        } | Select-Object -Last 4)
        if ($plans.Count -gt 0) {
            return 'Наши сохранённые планы:' + [Environment]::NewLine +
                (($plans | ForEach-Object { '• ' + (Get-YCleanLine ([string]$_.goal) 160) }) -join [Environment]::NewLine) +
                [Environment]::NewLine + 'Пункты из локальной памяти, а не новые обещания.'
        }
    }
    # Existing retrieval engine handles independent spaces, topic/privacy
    # controls and source attribution. A lexical query does not need embeddings.
    $hits = @(Find-YVectorMatches $q $null 4)
    if ($hits.Count -gt 0) {
        $lines = New-Object System.Collections.Generic.List[string]
        foreach ($hit in $hits) {
            $body = Get-YCleanLine ([string]$hit.Item.text) 220
            if (-not $body) { continue }
            $source = Get-YEvidenceLabel $hit.Item.ref
            $lines.Add('• ' + $body + ' [' + $source + ']')
            if ($lines.Count -ge 3) { break }
        }
        if ($lines.Count -gt 0) {
            return 'Вот что нашлось в сохранённой памяти по твоему запросу:' +
                [Environment]::NewLine + ($lines -join [Environment]::NewLine) +
                [Environment]::NewLine + 'Это найденные записи, а не самостоятельно проверенные факты.'
        }
    }
    return 'Я в автономном режиме без генеративной модели. По этой теме в доступной памяти не нашлось подходящих записей. Можешь спросить о планах или уточнить слова для поиска.'
}
function Invoke-YLocalChat($Messages) {
    if (-not [bool]$script:YLife.offline) { throw (New-YError 409 'Автономный режим не включён.') }
    $msgArray = @($Messages)
    $question = ''
    for ($i = $msgArray.Count - 1; $i -ge 0; $i--) {
        if ([string](Get-YValue $msgArray[$i] 'role' '') -eq 'user') {
            $question = [string](Get-YValue $msgArray[$i] 'content' '')
            break
        }
    }
    $content = ''
    $script:YLocalLastBackend = 'memory-only'
    # Optional real local LLM. Fail closed to deterministic memory lookup,
    # never silently fall back to any external cloud API.
    try {
        $health = Test-YLocalEngine
        if ([bool]$health.generative) {
            $payload = @{
                model = [string]$script:YLife.localModel
                stream = $false
                messages = $msgArray
                temperature = [double]$script:Config.temperature
                max_tokens = [Math]::Max(32, [Math]::Min(4096, [int]$script:Config.maxTokens))
            }
            $response = Invoke-YLocalLlama 'chat' $payload
            $choices = @(Get-YValue $response 'choices' @())
            if ($choices.Count -gt 0) {
                $content = [string](Get-YValue (Get-YValue $choices[0] 'message' @{}) 'content' '')
                if ($content.Trim()) { $script:YLocalLastBackend = 'llama.cpp' }
            }
        }
    } catch { }
    if (-not $content.Trim()) { $content = Get-YOfflineReply $question }
    return @{
        choices = @(@{ message = @{ content = $content } })
        model = $(if ($script:YLocalLastBackend -eq 'llama.cpp') { [string]$script:YLife.localModel } else { 'memory-only' })
    }
}
