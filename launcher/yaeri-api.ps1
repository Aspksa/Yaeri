#requires -Version 5.1
# Яэри: API локального сервера. Подключается из start.ps1 (dot-source).
#  - прокси к Cloud.ru Foundation Models (OpenAI-совместимый API), ключ остаётся на сервере;
#  - база данных: JSON-файлы в папке data\ (история, память, документы);
#  - RAG: эмбеддинги Cloud.ru + поиск ближайших фрагментов (косинусная близость).

$script:ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:ConfigDir = Join-Path $script:ProjectRoot 'config'
$script:ConfigFile = Join-Path $script:ConfigDir 'yaeri.config.json'
$script:ConfigExample = Join-Path $script:ConfigDir 'yaeri.config.example.json'
$script:DataDir = Join-Path $script:ProjectRoot 'data'
$script:Utf8 = [System.Text.UTF8Encoding]::new($false)

# ---------- Вспомогательный код на C# (компилируется встроенным .NET, установка не нужна) ----------
if (-not ('YaeriVec' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Globalization;

public static class YaeriVec
{
    // Нормализует вектор и упаковывает float32 в base64: файл меньше, чтение быстрее.
    public static string Encode(object[] values)
    {
        int n = values.Length;
        float[] f = new float[n];
        double sum = 0;
        for (int i = 0; i < n; i++)
        {
            double x = Convert.ToDouble(values[i], CultureInfo.InvariantCulture);
            f[i] = (float)x;
            sum += x * x;
        }
        double norm = Math.Sqrt(sum);
        if (norm > 0) for (int i = 0; i < n; i++) f[i] = (float)(f[i] / norm);
        byte[] bytes = new byte[n * 4];
        Buffer.BlockCopy(f, 0, bytes, 0, bytes.Length);
        return Convert.ToBase64String(bytes);
    }

    public static float[] Decode(string data)
    {
        byte[] bytes = Convert.FromBase64String(data);
        float[] f = new float[bytes.Length / 4];
        Buffer.BlockCopy(bytes, 0, f, 0, f.Length * 4);
        return f;
    }

    // Векторы нормализованы, поэтому скалярное произведение = косинусная близость.
    public static double Dot(float[] a, float[] b)
    {
        if (a == null || b == null || a.Length != b.Length) return -2;
        double s = 0;
        for (int i = 0; i < a.Length; i++) s += a[i] * b[i];
        return s;
    }
}

public class YaeriHttpException : Exception
{
    public int Code;
    public YaeriHttpException(int code, string message) : base(message) { Code = code; }
}
'@
}

function New-YError([int]$Code, [string]$Message) {
    return New-Object YaeriHttpException -ArgumentList $Code, $Message
}

# ---------- JSON ----------
# В PowerShell 5.1 используем JavaScriptSerializer: быстрее ConvertTo-Json и без ограничения 2 МБ.
$script:Serializer = $null
try {
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
    $script:Serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $script:Serializer.MaxJsonLength = [int]::MaxValue
    $script:Serializer.RecursionLimit = 512
} catch {
    $script:Serializer = $null  # PowerShell 7: используем встроенные командлеты.
}

function ConvertFrom-YJson([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }
    if ($null -ne $script:Serializer) {
        return , $script:Serializer.DeserializeObject($Text)
    }
    return , ($Text | ConvertFrom-Json -AsHashtable -Depth 100)
}

function ConvertTo-YJson($Value) {
    if ($null -ne $script:Serializer) { return $script:Serializer.Serialize($Value) }
    return ($Value | ConvertTo-Json -Depth 100 -Compress)
}

function Read-YJsonFile([string]$Path) {
    if (-not [System.IO.File]::Exists($Path)) { return $null }
    $text = [System.IO.File]::ReadAllText($Path, $script:Utf8)
    return , (ConvertFrom-YJson $text)
}

function Write-YJsonFile([string]$Path, $Value) {
    # Сначала временный файл, затем замена: при сбое старые данные не портятся.
    $tmp = $Path + '.tmp'
    [System.IO.File]::WriteAllText($tmp, (ConvertTo-YJson $Value), $script:Utf8)
    if ([System.IO.File]::Exists($Path)) {
        [System.IO.File]::Replace($tmp, $Path, $null)
    } else {
        [System.IO.File]::Move($tmp, $Path)
    }
}

function Test-YKey($Dict, [string]$Key) {
    # JavaScriptSerializer возвращает Dictionary (ContainsKey), PowerShell 7 — Hashtable (Contains).
    if ($Dict -is [System.Collections.Generic.IDictionary[string, object]]) { return $Dict.ContainsKey($Key) }
    if ($Dict -is [System.Collections.IDictionary]) { return $Dict.Contains($Key) }
    return $false
}

function Get-YValue($Dict, [string]$Key, $Default) {
    if ((Test-YKey $Dict $Key) -and $null -ne $Dict[$Key]) { return $Dict[$Key] }
    return $Default
}

function Get-YNow { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function New-YId { return [guid]::NewGuid().ToString('N').Substring(0, 12) }

# ---------- Настройки ----------
function Import-YConfig {
    $file = Read-YJsonFile $script:ConfigFile
    $cfg = @{
        apiKey         = ''
        baseUrl        = 'https://foundation-models.api.cloud.ru/v1'
        chatModel      = 'Qwen/Qwen3-235B-A22B-Instruct-2507'
        chatModels     = @()
        embeddingModel = 'Qwen/Qwen3-Embedding-0.6B'
        temperature    = 0.6
        maxTokens      = 2000
        historyTurns   = 20
        ragTopK        = 5
        memoryTopK     = 3
        minScore       = 0.3
        systemPrompt   = ''
    }
    if ($null -ne $file) {
        foreach ($key in @($cfg.Keys)) {
            if ((Test-YKey $file $key) -and $null -ne $file[$key]) { $cfg[$key] = $file[$key] }
        }
    }
    # Переменная окружения подходит тем, кто не хочет хранить ключ в файле.
    if ([string]::IsNullOrWhiteSpace([string]$cfg.apiKey) -and $env:CLOUDRU_API_KEY) {
        $cfg.apiKey = $env:CLOUDRU_API_KEY
    }
    $cfg.apiKey = ([string]$cfg.apiKey).Trim()
    $cfg.baseUrl = ([string]$cfg.baseUrl).Trim().TrimEnd('/')
    $script:Config = $cfg
}

function Test-YConfigured { return -not [string]::IsNullOrWhiteSpace([string]$script:Config.apiKey) }

function Save-YApiKey([string]$Key) {
    if (-not [System.IO.Directory]::Exists($script:ConfigDir)) {
        [void][System.IO.Directory]::CreateDirectory($script:ConfigDir)
    }
    $quoted = ConvertTo-YJson ([string]$Key)
    if ([System.IO.File]::Exists($script:ConfigFile)) {
        $text = [System.IO.File]::ReadAllText($script:ConfigFile, $script:Utf8)
    } elseif ([System.IO.File]::Exists($script:ConfigExample)) {
        $text = [System.IO.File]::ReadAllText($script:ConfigExample, $script:Utf8)
    } else {
        $text = '{ "apiKey": "" }'
    }
    $pattern = '"apiKey"\s*:\s*"(?:[^"\\]|\\.)*"'
    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, { param($m) '"apiKey": ' + $quoted })
    } else {
        $text = '{ "apiKey": ' + $quoted + ' }'
    }
    [System.IO.File]::WriteAllText($script:ConfigFile, $text, $script:Utf8)
}

# ---------- База данных (JSON-файлы в data\) ----------
function Import-YStore {
    if (-not [System.IO.Directory]::Exists($script:DataDir)) {
        [void][System.IO.Directory]::CreateDirectory($script:DataDir)
    }
    $script:HistoryFile = Join-Path $script:DataDir 'history.json'
    $script:MemoryFile = Join-Path $script:DataDir 'memory.json'
    $script:DocsFile = Join-Path $script:DataDir 'docs.json'

    $h = Read-YJsonFile $script:HistoryFile
    $script:History = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $h 'messages' @())) { [void]$script:History.Add($m) }

    $mem = Read-YJsonFile $script:MemoryFile
    $script:MemoryModel = [string](Get-YValue $mem 'model' '')
    $script:Memory = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $mem 'items' @())) { [void]$script:Memory.Add($m) }

    $d = Read-YJsonFile $script:DocsFile
    $script:DocsModel = [string](Get-YValue $d 'model' '')
    $script:Docs = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $d 'docs' @())) { [void]$script:Docs.Add($m) }
    $script:Chunks = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $d 'chunks' @())) { [void]$script:Chunks.Add($m) }

    $script:VecCache = @{}
}

function Save-YHistory { Write-YJsonFile $script:HistoryFile @{ version = 1; messages = $script:History.ToArray() } }
function Save-YMemory { Write-YJsonFile $script:MemoryFile @{ version = 1; model = $script:MemoryModel; items = $script:Memory.ToArray() } }
function Save-YDocs {
    Write-YJsonFile $script:DocsFile @{
        version = 1; model = $script:DocsModel
        docs = $script:Docs.ToArray(); chunks = $script:Chunks.ToArray()
    }
}

function Get-YVec($Item) {
    $id = [string]$Item['id']
    if (-not $script:VecCache.ContainsKey($id)) {
        $script:VecCache[$id] = [YaeriVec]::Decode([string]$Item['vec'])
    }
    return , $script:VecCache[$id]
}

# ---------- Cloud.ru ----------
try {
    # Windows PowerShell 5.1 по умолчанию может не включать TLS 1.2.
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12
} catch { }

function Invoke-CloudRu([string]$Method, [string]$Path, $Body) {
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Ключ Cloud.ru не задан. Добавьте его в config\yaeri.config.json и перезапустите Яэри.') }
    $request = [System.Net.HttpWebRequest]::Create($script:Config.baseUrl + $Path)
    $request.Method = $Method
    $request.Timeout = 180000
    $request.ReadWriteTimeout = 180000
    $request.Accept = 'application/json'
    $request.Headers['Authorization'] = 'Bearer ' + $script:Config.apiKey
    if ($null -ne $Body) {
        $bytes = $script:Utf8.GetBytes((ConvertTo-YJson $Body))
        $request.ContentType = 'application/json; charset=utf-8'
        $request.ContentLength = $bytes.Length
        $out = $request.GetRequestStream()
        try { $out.Write($bytes, 0, $bytes.Length) } finally { $out.Dispose() }
    }

    $response = $null
    try {
        $response = $request.GetResponse()
    } catch {
        $ex = $_.Exception
        while ($null -ne $ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }
        if ($null -ne $ex -and $null -ne $ex.Response) {
            $code = [int]$ex.Response.StatusCode
            $reader = [System.IO.StreamReader]::new($ex.Response.GetResponseStream(), $script:Utf8)
            $text = $reader.ReadToEnd()
            $reader.Dispose()
            $ex.Response.Dispose()
            $detail = $text
            try {
                $parsed = ConvertFrom-YJson $text
                if ($parsed -is [System.Collections.IDictionary]) {
                    $err = Get-YValue $parsed 'error' $null
                    if ($err -is [System.Collections.IDictionary]) { $detail = [string](Get-YValue $err 'message' $text) }
                    elseif ($null -ne $err) { $detail = [string]$err }
                    elseif (Test-YKey $parsed 'detail') { $detail = ConvertTo-YJson $parsed['detail'] }
                    elseif (Test-YKey $parsed 'message') { $detail = [string]$parsed['message'] }
                }
            } catch { }
            if ($detail.Length -gt 400) { $detail = $detail.Substring(0, 400) + '…' }
            $hint = ''
            if ($code -eq 401 -or $code -eq 403) { $hint = ' Проверьте API-ключ в config\yaeri.config.json.' }
            elseif ($code -eq 404) { $hint = ' Проверьте название модели.' }
            throw (New-YError 502 ('Cloud.ru ответил ' + $code + ': ' + $detail + $hint))
        }
        $why = $_.Exception.Message
        if ($null -ne $ex) { $why = $ex.Message }
        throw (New-YError 502 ('Нет связи с Cloud.ru: ' + $why))
    }
    try {
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream(), $script:Utf8)
        $text = $reader.ReadToEnd()
        $reader.Dispose()
    } finally {
        $response.Dispose()
    }
    return , (ConvertFrom-YJson $text)
}

function Get-YEmbeddings([string[]]$Texts) {
    $out = New-Object System.Collections.Generic.List[string]
    $batchSize = 16
    for ($i = 0; $i -lt $Texts.Count; $i += $batchSize) {
        $last = [Math]::Min($i + $batchSize, $Texts.Count) - 1
        $batch = New-Object System.Collections.Generic.List[string]
        foreach ($t in @($Texts[$i..$last])) {
            $s = [string]$t
            if ($s.Length -gt 4000) { $s = $s.Substring(0, 4000) }
            $batch.Add($s)
        }
        $resp = Invoke-CloudRu 'POST' '/embeddings' @{ model = [string]$script:Config.embeddingModel; input = $batch.ToArray() }
        $data = @(Get-YValue $resp 'data' @()) | Sort-Object { [int](Get-YValue $_ 'index' 0) }
        foreach ($d in $data) { $out.Add([YaeriVec]::Encode([object[]]@($d['embedding']))) }
    }
    if ($out.Count -ne $Texts.Count) { throw (New-YError 502 'Cloud.ru вернул неполный ответ эмбеддингов.') }
    return , $out.ToArray()
}

function Get-YModels {
    if ($null -ne $script:ModelsCache) { return , $script:ModelsCache }
    $resp = Invoke-CloudRu 'GET' '/models' $null
    $ids = New-Object System.Collections.Generic.List[string]
    foreach ($m in @(Get-YValue $resp 'data' @())) {
        $id = [string](Get-YValue $m 'id' '')
        if ($id) { $ids.Add($id) }
    }
    $script:ModelsCache = $ids.ToArray()
    return , $script:ModelsCache
}

# ---------- RAG ----------
function Split-YText([string]$Text, [int]$Size = 900, [int]$Overlap = 150) {
    $t = $Text -replace "`r`n?", "`n"
    $t = ($t -replace '[ \t]+', ' ').Trim()
    $chunks = New-Object System.Collections.Generic.List[string]
    $stops = [char[]]".!?`n"
    $current = ''
    foreach ($para in ($t -split "\n\s*\n")) {
        $p = $para.Trim()
        if (-not $p) { continue }
        if ($current.Length + $p.Length + 2 -le $Size) {
            if ($current) { $current = $current + "`n`n" + $p } else { $current = $p }
            continue
        }
        if ($current) { $chunks.Add($current); $current = '' }
        while ($p.Length -gt $Size) {
            $cut = $p.LastIndexOfAny($stops, $Size - 1)
            if ($cut -lt $Size / 2) { $cut = $p.LastIndexOf(' ', $Size - 1) }
            if ($cut -lt $Size / 2) { $cut = $Size - 1 }
            $chunks.Add($p.Substring(0, $cut + 1).Trim())
            # Перекрытие: следующий фрагмент начинается немного раньше, с границы слова.
            $start = $cut + 1 - $Overlap
            $space = $p.IndexOf(' ', $start)
            if ($space -gt $start -and $space -le $cut) { $start = $space + 1 }
            $p = $p.Substring($start).Trim()
        }
        $current = $p
    }
    if ($current) { $chunks.Add($current) }
    return , $chunks.ToArray()
}

function Find-YSimilar($QueryVec, $Items, [int]$Top, [double]$MinScore, [long]$Before = [long]::MaxValue) {
    $scored = New-Object System.Collections.Generic.List[object]
    foreach ($item in $Items) {
        if ($Before -ne [long]::MaxValue -and [long](Get-YValue $item 't' 0) -ge $Before) { continue }
        $score = [YaeriVec]::Dot($QueryVec, (Get-YVec $item))
        if ($score -ge $MinScore) { $scored.Add([pscustomobject]@{ Item = $item; Score = $score }) }
    }
    return , @($scored | Sort-Object Score -Descending | Select-Object -First $Top)
}

function Test-YIndexReady {
    return ($script:Chunks.Count -eq 0 -or $script:DocsModel -eq [string]$script:Config.embeddingModel)
}

# ---------- Обработчики API ----------
function Get-YStatus {
    return @{
        configured     = (Test-YConfigured)
        provider       = 'Cloud.ru Foundation Models'
        chatModel      = [string]$script:Config.chatModel
        embeddingModel = [string]$script:Config.embeddingModel
        docs           = $script:Docs.Count
        chunks         = $script:Chunks.Count
        memory         = $script:Memory.Count
        messages       = $script:History.Count
        reindexNeeded  = -not (Test-YIndexReady)
        storage        = 'data\'
    }
}

function Get-YModelList {
    $default = [string]$script:Config.chatModel
    $fallback = New-Object System.Collections.Generic.List[string]
    $fallback.Add($default)
    foreach ($m in @($script:Config.chatModels)) { if ($m -and -not $fallback.Contains([string]$m)) { $fallback.Add([string]$m) } }
    try {
        $all = Get-YModels
        $list = New-Object System.Collections.Generic.List[string]
        foreach ($m in $fallback) { $list.Add($m) }
        foreach ($m in $all) {
            # Эмбеддинг- и rerank-модели не умеют вести диалог.
            if ($m -match '(?i)embed|rerank|bge-|e5-|whisper|tts') { continue }
            if (-not $list.Contains($m)) { $list.Add($m) }
        }
        return @{ models = $list.ToArray(); default = $default; error = '' }
    } catch {
        return @{ models = $fallback.ToArray(); default = $default; error = $_.Exception.Message }
    }
}

function Get-YHistoryPage {
    $start = [Math]::Max(0, $script:History.Count - 200)
    $page = @()
    if ($script:History.Count -gt 0) { $page = $script:History.GetRange($start, $script:History.Count - $start).ToArray() }
    return @{ messages = $page }
}

function Get-YDocsList {
    return @{ docs = $script:Docs.ToArray(); reindexNeeded = -not (Test-YIndexReady); embeddingModel = [string]$script:Config.embeddingModel }
}

function Add-YDoc($Req) {
    $name = ([string](Get-YValue $Req 'name' 'документ')).Trim()
    if ($name.Length -gt 120) { $name = $name.Substring(0, 120) }
    if (-not $name) { $name = 'документ' }
    $text = [string](Get-YValue $Req 'text' '')
    if ([string]::IsNullOrWhiteSpace($text)) { throw (New-YError 400 'Документ пустой.') }
    if ($text.Length -gt 1000000) { throw (New-YError 413 'Документ слишком большой: максимум 1 000 000 символов.') }
    if (-not (Test-YIndexReady)) { throw (New-YError 409 'Сначала переиндексируйте документы: сменилась модель эмбеддингов.') }

    $parts = Split-YText $text
    if ($parts.Count -eq 0) { throw (New-YError 400 'В документе нет текста.') }
    $vectors = Get-YEmbeddings $parts

    $doc = @{ id = (New-YId); name = $name; added = (Get-YNow); chars = $text.Length; chunks = $parts.Count }
    for ($i = 0; $i -lt $parts.Count; $i++) {
        [void]$script:Chunks.Add(@{ id = (New-YId); docId = $doc.id; docName = $name; n = $i + 1; text = $parts[$i]; vec = $vectors[$i] })
    }
    [void]$script:Docs.Add($doc)
    $script:DocsModel = [string]$script:Config.embeddingModel
    Save-YDocs
    return @{ doc = $doc }
}

function Remove-YDoc($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $doc = $script:Docs | Where-Object { [string]$_['id'] -eq $id } | Select-Object -First 1
    if ($null -eq $doc) { throw (New-YError 404 'Документ не найден.') }
    $script:Docs.Remove($doc)
    $keep = New-Object System.Collections.ArrayList
    foreach ($c in $script:Chunks) {
        if ([string]$c['docId'] -eq $id) { $script:VecCache.Remove([string]$c['id']) } else { [void]$keep.Add($c) }
    }
    $script:Chunks = $keep
    Save-YDocs
    return @{ ok = $true }
}

function Update-YIndex {
    # Пересчитать эмбеддинги документов и памяти после смены модели эмбеддингов.
    $model = [string]$script:Config.embeddingModel
    if ($script:Chunks.Count -gt 0) {
        $vectors = Get-YEmbeddings @($script:Chunks | ForEach-Object { [string]$_['text'] })
        for ($i = 0; $i -lt $script:Chunks.Count; $i++) { $script:Chunks[$i]['vec'] = $vectors[$i] }
    }
    $script:DocsModel = $model
    Save-YDocs
    if ($script:Memory.Count -gt 0) {
        $vectors = Get-YEmbeddings @($script:Memory | ForEach-Object { [string]$_['text'] })
        for ($i = 0; $i -lt $script:Memory.Count; $i++) { $script:Memory[$i]['vec'] = $vectors[$i] }
    }
    $script:MemoryModel = $model
    Save-YMemory
    $script:VecCache = @{}
    return @{ ok = $true; chunks = $script:Chunks.Count; memory = $script:Memory.Count }
}

function Clear-YHistory {
    $script:History.Clear()
    Save-YHistory
    return @{ ok = $true }
}

function Clear-YMemory {
    $script:Memory.Clear()
    $script:VecCache = @{}
    Save-YMemory
    return @{ ok = $true }
}

function Get-YTextValue([string]$Text) {
    # Рассуждающие модели (например, Qwen3) могут присылать скрытые размышления в <think>.
    $clean = [regex]::Replace($Text, '(?s)<think>.*?</think>', '')
    return $clean.Trim()
}

function Invoke-YChat($Req) {
    $text = ([string](Get-YValue $Req 'text' '')).Trim()
    if (-not $text) { throw (New-YError 400 'Пустое сообщение.') }
    if ($text.Length -gt 8000) { $text = $text.Substring(0, 8000) }
    $model = ([string](Get-YValue $Req 'model' '')).Trim()
    if ($model -notmatch '^[\w.\-/:@]{1,120}$') { $model = [string]$script:Config.chatModel }
    $useRag = [bool](Get-YValue $Req 'rag' $true)
    $remember = [bool](Get-YValue $Req 'remember' $true)
    $name = ([string](Get-YValue $Req 'name' '')).Trim()
    if ($name.Length -gt 30) { $name = $name.Substring(0, 30) }
    if (-not $name) { $name = 'Хозяин' }

    # Последние реплики, которые уйдут в модель как есть.
    $turns = [Math]::Max(2, [int]$script:Config.historyTurns)
    $start = [Math]::Max(0, $script:History.Count - $turns)
    $recent = @()
    if ($script:History.Count -gt 0) { $recent = $script:History.GetRange($start, $script:History.Count - $start).ToArray() }
    $recentFrom = [long]::MaxValue
    if ($recent.Count -gt 0) { $recentFrom = [long](Get-YValue $recent[0] 't' 0) }

    $userMsg = @{ id = (New-YId); role = 'user'; text = $text; t = (Get-YNow) }
    [void]$script:History.Add($userMsg)
    Save-YHistory

    # Поиск по документам и памяти.
    $sources = New-Object System.Collections.Generic.List[object]
    $contextLines = New-Object System.Collections.Generic.List[string]
    $ragNote = ''
    $queryVec = $null
    if ($useRag -and ($script:Chunks.Count -gt 0 -or $script:Memory.Count -gt 0)) {
        try {
            $queryVec = [YaeriVec]::Decode((Get-YEmbeddings @($text))[0])
            $minScore = [double]$script:Config.minScore
            if ($script:Chunks.Count -gt 0) {
                if (Test-YIndexReady) {
                    foreach ($hit in (Find-YSimilar $queryVec $script:Chunks ([int]$script:Config.ragTopK) $minScore)) {
                        $n = $contextLines.Count + 1
                        $contextLines.Add('[' + $n + '] Документ «' + $hit.Item['docName'] + '», фрагмент ' + $hit.Item['n'] + ":`n" + $hit.Item['text'])
                        $sources.Add(@{ kind = 'doc'; label = ([string]$hit.Item['docName'] + ' #' + $hit.Item['n']); score = [Math]::Round($hit.Score, 3) })
                    }
                } else {
                    $ragNote = 'Документы не использованы: сменилась модель эмбеддингов, нужна переиндексация.'
                }
            }
            if ($script:Memory.Count -gt 0 -and $script:MemoryModel -eq [string]$script:Config.embeddingModel) {
                foreach ($hit in (Find-YSimilar $queryVec $script:Memory ([int]$script:Config.memoryTopK) $minScore $recentFrom)) {
                    $n = $contextLines.Count + 1
                    $when = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$hit.Item['t']).ToLocalTime().ToString('dd.MM.yyyy')
                    $contextLines.Add('[' + $n + '] Из прошлого разговора (' + $when + "):`n" + $hit.Item['text'])
                    $sources.Add(@{ kind = 'memory'; label = ('память, ' + $when); score = [Math]::Round($hit.Score, 3) })
                }
            }
        } catch {
            $ragNote = 'Поиск по знаниям не сработал: ' + $_.Exception.Message
        }
    }

    $system = [string]$script:Config.systemPrompt
    if (-not $system) {
        $system = 'Ты — Яэри, восьмихвостая лисица-кицунэ и персональная AI-помощница. ' +
            'Отвечай на языке пользователя (по умолчанию по-русски), тепло, дружелюбно и по делу. ' +
            'Обращайся к пользователю «{name}». ' +
            'Если ниже дан контекст из документов или прошлых разговоров, опирайся на него, ' +
            'не выдумывай факты и при необходимости ссылайся на номера фрагментов. ' +
            'Если ответа нет ни в контексте, ни в твоих знаниях, честно скажи об этом.'
    }
    $system = $system.Replace('{name}', $name)
    if ($contextLines.Count -gt 0) {
        $system += "`n`nКонтекст (документы пользователя и память о прошлых разговорах):`n`n" + ($contextLines -join "`n`n")
    }

    $messages = New-Object System.Collections.Generic.List[object]
    $messages.Add(@{ role = 'system'; content = $system })
    foreach ($m in $recent) {
        $role = [string]$m['role']
        if ($role -ne 'user' -and $role -ne 'assistant') { continue }
        $messages.Add(@{ role = $role; content = [string]$m['text'] })
    }
    $messages.Add(@{ role = 'user'; content = $text })

    $body = @{
        model       = $model
        messages    = $messages.ToArray()
        temperature = [double]$script:Config.temperature
        max_tokens  = [int]$script:Config.maxTokens
    }
    $resp = Invoke-CloudRu 'POST' '/chat/completions' $body
    $choice = @(Get-YValue $resp 'choices' @())
    $content = ''
    if ($choice.Count -gt 0) { $content = [string](Get-YValue (Get-YValue $choice[0] 'message' @{}) 'content' '') }
    $content = Get-YTextValue $content
    if (-not $content) { throw (New-YError 502 'Модель вернула пустой ответ.') }

    $answer = @{ id = (New-YId); role = 'assistant'; text = $content; t = (Get-YNow); model = $model; sources = $sources.ToArray() }
    [void]$script:History.Add($answer)
    Save-YHistory

    # Долговременная память: пара «вопрос — ответ» с эмбеддингом.
    if ($remember) {
        try {
            $memText = 'Пользователь: ' + $text + "`nЯэри: " + $content
            if ($memText.Length -gt 3000) { $memText = $memText.Substring(0, 3000) }
            $vec = (Get-YEmbeddings @($memText))[0]
            if ($script:MemoryModel -ne [string]$script:Config.embeddingModel) {
                if ($script:Memory.Count -eq 0) { $script:MemoryModel = [string]$script:Config.embeddingModel }
            }
            if ($script:MemoryModel -eq [string]$script:Config.embeddingModel) {
                [void]$script:Memory.Add(@{ id = (New-YId); t = [long]$userMsg.t; text = $memText; vec = $vec })
                Save-YMemory
            }
        } catch {
            if (-not $ragNote) { $ragNote = 'Не удалось сохранить в память: ' + $_.Exception.Message }
        }
    }

    return @{ user = $userMsg; reply = $answer; note = $ragNote }
}

function Invoke-YApi([string]$Method, [string]$Path, [string]$BodyText) {
    $req = $null
    if ($Method -eq 'POST') {
        try { $req = ConvertFrom-YJson $BodyText } catch { throw (New-YError 400 'Некорректный JSON.') }
        if ($null -eq $req) { $req = @{} }
        if (-not ($req -is [System.Collections.IDictionary])) { throw (New-YError 400 'Ожидался JSON-объект.') }
    }
    $route = $Method + ' ' + $Path
    switch ($route) {
        'GET /api/status'          { return Get-YStatus }
        'GET /api/models'          { return Get-YModelList }
        'GET /api/history'         { return Get-YHistoryPage }
        'POST /api/chat'           { return Invoke-YChat $req }
        'POST /api/history/clear'  { return Clear-YHistory }
        'POST /api/memory/clear'   { return Clear-YMemory }
        'GET /api/docs'            { return Get-YDocsList }
        'POST /api/docs'           { return Add-YDoc $req }
        'POST /api/docs/delete'    { return Remove-YDoc $req }
        'POST /api/reindex'        { return Update-YIndex }
    }
    throw (New-YError 404 'Неизвестный адрес API.')
}
