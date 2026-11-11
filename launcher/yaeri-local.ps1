#requires -Version 5.1
# Optional offline chat powered by an already installed Ollama service.
# Deliberately hardcoded loopback target: no proxy, redirect or remote URL.
function Invoke-YLocalOllama([string]$Endpoint, $Payload = $null) {
    if (@('tags','chat') -notcontains $Endpoint) { throw (New-YError 400 'Неизвестная локальная операция.') }
    $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:11434/api/' + $Endpoint)
    $request.Proxy = [System.Net.GlobalProxySelection]::GetEmptyWebProxy()
    $request.AllowAutoRedirect = $false
    $request.Timeout = $(if ($Endpoint -eq 'chat') { 180000 } else { 4000 })
    $request.ReadWriteTimeout = 180000
    $request.Accept = 'application/json'
    $request.Method = $(if ($Endpoint -eq 'chat') { 'POST' } else { 'GET' })
    if ($Endpoint -eq 'chat') {
        $bytes = $script:Utf8.GetBytes((ConvertTo-YJson $Payload))
        $request.ContentType = 'application/json; charset=utf-8'
        $request.ContentLength = $bytes.Length
        $stream = $request.GetRequestStream()
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    $response = $null
    try { $response = $request.GetResponse() }
    catch {
        throw (New-YError 503 ('Локальная модель недоступна. Установите Ollama, запустите его и загрузите модель ' +
            [string]$script:YLife.localModel + '. Подробности: ' + $_.Exception.Message))
    }
    try {
        if ([int]$response.StatusCode -ne 200) { throw (New-YError 502 'Локальный сервер вернул неожиданный ответ.') }
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), $script:Utf8)
        try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
        return ,(ConvertFrom-YJson $text)
    } finally { $response.Dispose() }
}
function Test-YLocalOllama {
    try {
        $result = Invoke-YLocalOllama 'tags'
        $models = @((Get-YValue $result 'models' @()) | ForEach-Object { [string](Get-YValue $_ 'name' '') })
        $name = [string]$script:YLife.localModel
        return @{ ok = ($models -contains $name); available = $models
            error = $(if ($models -contains $name) { '' } else { 'Нужная модель ещё не загружена: ollama pull ' + $name }) }
    } catch {
        return @{ ok = $false; available = @(); error = $_.Exception.Message }
    }
}
function Invoke-YLocalChat($Messages) {
    if (-not [bool]$script:YLife.offline) { throw (New-YError 409 'Локальная модель не выбрана.') }
    $payload = @{
        model = [string]$script:YLife.localModel
        stream = $false
        messages = @($Messages)
        options = @{
            temperature = [double]$script:Config.temperature
            num_predict = [Math]::Max(32, [Math]::Min(4096, [int]$script:Config.maxTokens))
        }
    }
    $response = Invoke-YLocalOllama 'chat' $payload
    $msg = Get-YValue $response 'message' $null
    $body = [string](Get-YValue $msg 'content' '')
    if (-not $body.Trim()) { throw (New-YError 502 'Ollama не вернул текст ответа. Проверьте локальную модель.') }
    return @{
        choices = @(@{ message = @{ content = $body } })
        model = [string]$script:YLife.localModel
    }
}
