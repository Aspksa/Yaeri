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

# Душа Яэри (характер, настроение, мысли о хозяине) — в отдельном файле.
. (Join-Path $PSScriptRoot 'yaeri-soul.ps1')
. (Join-Path $PSScriptRoot 'yaeri-evolution.ps1')

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

# Граф «второго мозга»: связи между воспоминаниями и документами по смыслу.
if (-not ('YaeriGraph' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;

public static class YaeriGraph
{
    // Для каждой вершины берёт до k ближайших соседей с близостью не ниже min.
    // Возвращает уникальные пары [i, j, близость].
    public static List<object[]> Links(float[][] v, int k, double min)
    {
        int n = v.Length;
        var seen = new HashSet<long>();
        var res = new List<object[]>();
        var bestJ = new int[k];
        var bestS = new double[k];
        for (int i = 0; i < n; i++)
        {
            if (v[i] == null) continue;
            int cnt = 0;
            for (int j = 0; j < n; j++)
            {
                if (j == i || v[j] == null || v[j].Length != v[i].Length) continue;
                double s = 0;
                float[] a = v[i], b = v[j];
                for (int d = 0; d < a.Length; d++) s += a[d] * b[d];
                if (s < min) continue;
                int pos = cnt < k ? cnt++ : k;
                if (pos == k) { if (s <= bestS[k - 1]) continue; pos = k - 1; }
                while (pos > 0 && bestS[pos - 1] < s) { bestS[pos] = bestS[pos - 1]; bestJ[pos] = bestJ[pos - 1]; pos--; }
                bestS[pos] = s; bestJ[pos] = j;
            }
            for (int t = 0; t < cnt; t++)
            {
                int a2 = Math.Min(i, bestJ[t]), b2 = Math.Max(i, bestJ[t]);
                if (seen.Add((long)a2 * n + b2)) res.Add(new object[] { a2, b2, Math.Round(bestS[t], 3) });
            }
        }
        return res;
    }

    // Средний нормализованный вектор (например, всех фрагментов документа).
    public static float[] Mean(List<float[]> list)
    {
        if (list == null || list.Count == 0) return null;
        int d = list[0].Length;
        var m = new double[d];
        foreach (var x in list) { if (x == null || x.Length != d) continue; for (int i = 0; i < d; i++) m[i] += x[i]; }
        double sum = 0;
        for (int i = 0; i < d; i++) sum += m[i] * m[i];
        double norm = Math.Sqrt(sum);
        var f = new float[d];
        for (int i = 0; i < d; i++) f[i] = (float)(norm > 0 ? m[i] / norm : 0);
        return f;
    }
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
        # PowerShell превращает $null в пустую строку для строковых параметров .NET,
        # а File.Replace на пустом пути резервной копии падает. NullString передаёт настоящий null.
        [System.IO.File]::Replace($tmp, $Path, [System.Management.Automation.Language.NullString]::Value)
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
        smartModel     = ''
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

function Get-YKeySource {
    # Откуда взят ключ: из файла настроек, из переменной окружения или ниоткуда.
    $file = Read-YJsonFile $script:ConfigFile
    if ($null -ne $file -and -not [string]::IsNullOrWhiteSpace([string](Get-YValue $file 'apiKey' ''))) { return 'file' }
    if ($env:CLOUDRU_API_KEY) { return 'env' }
    return ''
}

function Set-YConfigString([string]$Name, [string]$Value) {
    # Меняет одно строковое поле в config\yaeri.config.json, сохраняя остальной файл как есть.
    if (-not [System.IO.Directory]::Exists($script:ConfigDir)) {
        [void][System.IO.Directory]::CreateDirectory($script:ConfigDir)
    }
    $quoted = ConvertTo-YJson ([string]$Value)
    if ([System.IO.File]::Exists($script:ConfigFile)) {
        $text = [System.IO.File]::ReadAllText($script:ConfigFile, $script:Utf8)
    } elseif ([System.IO.File]::Exists($script:ConfigExample)) {
        $text = [System.IO.File]::ReadAllText($script:ConfigExample, $script:Utf8)
    } else {
        $text = '{ }'
    }
    $pattern = '"' + [regex]::Escape($Name) + '"\s*:\s*"(?:[^"\\]|\\.)*"'
    if ($text -match $pattern) {
        $text = [regex]::Replace($text, $pattern, { param($m) '"' + $Name + '": ' + $quoted })
    } else {
        $brace = $text.IndexOf('{')
        if ($brace -lt 0) { $text = '{ }'; $brace = 0 }
        $rest = $text.Substring($brace + 1)
        $sep = if ($rest.Trim().StartsWith('}')) { '' } else { ',' }
        $text = $text.Substring(0, $brace + 1) + [Environment]::NewLine + '  "' + $Name + '": ' + $quoted + $sep + $rest
    }
    # Сначала временный файл: если запись оборвётся, старые настройки не пострадают.
    $tmp = $script:ConfigFile + '.tmp'
    [System.IO.File]::WriteAllText($tmp, $text, $script:Utf8)
    if ([System.IO.File]::Exists($script:ConfigFile)) {
        [System.IO.File]::Replace($tmp, $script:ConfigFile, [System.Management.Automation.Language.NullString]::Value)
    } else {
        [System.IO.File]::Move($tmp, $script:ConfigFile)
    }
}

function Save-YApiKey([string]$Key) { Set-YConfigString 'apiKey' $Key }

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

    # Рабочая память: короткие факты по разделам, всегда видны модели.
    $script:NotesFile = Join-Path $script:DataDir 'notes.json'
    $n = Read-YJsonFile $script:NotesFile
    $script:Notes = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $n 'items' @())) { [void]$script:Notes.Add($m) }

    $script:VecCache = @{}

    # Душа Яэри: характер, настроение, представление о хозяине, дневник.
    Import-YSoul
    Import-YEvolution
}

function Save-YHistory { Write-YJsonFile $script:HistoryFile @{ version = 1; messages = $script:History.ToArray() } }
function Save-YMemory { Write-YJsonFile $script:MemoryFile @{ version = 1; model = $script:MemoryModel; items = $script:Memory.ToArray() } }
function Save-YNotes { Write-YJsonFile $script:NotesFile @{ version = 1; items = $script:Notes.ToArray() } }
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
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Ключ Cloud.ru не задан. Введите его в настройках Яэри (⚙ → Подключение).') }
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
            if ($code -eq 401 -or $code -eq 403) { $hint = ' Проверьте API-ключ в настройках Яэри (⚙ → Подключение).' }
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
    # Статус должен отвечать всегда: без него страница не покажет поле для ключа.
    $level = $null
    try { $level = Get-YSoulLevel $script:Soul.xp } catch { $level = $null }
    $reindex = $false
    try { $reindex = -not (Test-YIndexReady) } catch { $reindex = $false }
    return @{
        configured     = (Test-YConfigured)
        keySource      = (Get-YKeySource)
        provider       = 'Cloud.ru Foundation Models'
        chatModel      = [string]$script:Config.chatModel
        smartModel     = [string]$script:Config.smartModel
        embeddingModel = [string]$script:Config.embeddingModel
        docs           = $script:Docs.Count
        chunks         = $script:Chunks.Count
        memory         = $script:Memory.Count
        notes          = $script:Notes.Count
        messages       = $script:History.Count
        reindexNeeded  = $reindex
        soulLevel      = $level
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

# ---------- Рабочая память (заметки) ----------
$script:NotesLimit = 1000
$script:NoteTag = '(?is)<(?:память|memory)(?:\s+(?:раздел|section|cat)\s*=\s*["«]?([^"»>]{1,40}?)["»]?)?\s*>(.*?)</(?:память|memory)\s*>'

function Get-YCleanLine([string]$Text, [int]$Max) {
    $t = ([regex]::Replace([string]$Text, '\s+', ' ')).Trim()
    if ($t.Length -gt $Max) { $t = $t.Substring(0, $Max).Trim() }
    return $t
}

function Get-YNoteCat([string]$Cat) {
    $cat = Get-YCleanLine $Cat 40
    if (-not $cat) { return 'Общее' }
    # Один и тот же раздел в разном регистре («планы», «Планы») не дробим.
    foreach ($n in $script:Notes) {
        if ([string]::Equals([string]$n['cat'], $cat, [System.StringComparison]::OrdinalIgnoreCase)) { return [string]$n['cat'] }
    }
    return $cat.Substring(0, 1).ToUpperInvariant() + $cat.Substring(1)
}

function Add-YNoteItem([string]$Cat, [string]$Text, [string]$Src) {
    $text = Get-YCleanLine $Text 500
    if (-not $text) { return $null }
    foreach ($n in $script:Notes) {
        if ([string]::Equals([string]$n['text'], $text, [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    }
    if ($script:Notes.Count -ge $script:NotesLimit) { return $null }
    $item = @{ id = (New-YId); cat = (Get-YNoteCat $Cat); text = $text; t = (Get-YNow); src = $Src; pinned = $false }
    [void]$script:Notes.Add($item)
    return $item
}

function Find-YNote([string]$Id) {
    foreach ($n in $script:Notes) { if ([string]$n['id'] -eq $Id) { return $n } }
    throw (New-YError 404 'Заметка не найдена.')
}

function Get-YNotesList { return @{ notes = $script:Notes.ToArray() } }

function Add-YNote($Req) {
    if ($script:Notes.Count -ge $script:NotesLimit) { throw (New-YError 413 'Рабочая память заполнена: удалите старые заметки.') }
    $item = Add-YNoteItem ([string](Get-YValue $Req 'cat' '')) ([string](Get-YValue $Req 'text' '')) 'user'
    if ($null -eq $item) { throw (New-YError 400 'Заметка пустая или уже есть в памяти.') }
    Save-YNotes
    return @{ note = $item }
}

function Update-YNote($Req) {
    $note = Find-YNote ([string](Get-YValue $Req 'id' ''))
    if (Test-YKey $Req 'text') {
        $text = Get-YCleanLine ([string]$Req['text']) 500
        if (-not $text) { throw (New-YError 400 'Заметка пустая.') }
        $note['text'] = $text
    }
    if (Test-YKey $Req 'cat') { $note['cat'] = Get-YNoteCat ([string]$Req['cat']) }
    if (Test-YKey $Req 'pinned') { $note['pinned'] = [bool]$Req['pinned'] }
    Save-YNotes
    return @{ note = $note }
}

function Remove-YNote($Req) {
    $note = Find-YNote ([string](Get-YValue $Req 'id' ''))
    $script:Notes.Remove($note)
    Save-YNotes
    return @{ ok = $true }
}

function Remove-YMemoryItem($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    foreach ($m in $script:Memory) {
        if ([string]$m['id'] -eq $id) {
            $script:Memory.Remove($m)
            $script:VecCache.Remove($id)
            Save-YMemory
            return @{ ok = $true }
        }
    }
    throw (New-YError 404 'Воспоминание не найдено.')
}

function Get-YNotesPrompt {
    if ($script:Notes.Count -eq 0) { return '' }
    $sorted = @($script:Notes | Sort-Object `
        @{ Expression = { [bool](Get-YValue $_ 'pinned' $false) }; Descending = $true }, `
        @{ Expression = { [long](Get-YValue $_ 't' 0) }; Descending = $true })
    $lines = New-Object System.Collections.Generic.List[string]
    $size = 0
    foreach ($n in $sorted) {
        $line = '- [' + [string]$n['cat'] + '] ' + [string]$n['text']
        if ($size + $line.Length -gt 6000) { break }
        $lines.Add($line)
        $size += $line.Length + 1
    }
    return ($lines -join "`n")
}

function Get-YBrain {
    # Данные для «второго мозга»: заметки, воспоминания, документы и связи по смыслу.
    $mem = New-Object System.Collections.Generic.List[object]
    $start = [Math]::Max(0, $script:Memory.Count - 600)
    for ($i = $start; $i -lt $script:Memory.Count; $i++) {
        $m = $script:Memory[$i]
        $text = [string]$m['text']
        if ($text.Length -gt 600) { $text = $text.Substring(0, 600) + '…' }
        $mem.Add(@{ id = [string]$m['id']; t = [long](Get-YValue $m 't' 0); text = $text })
    }
    $links = @()
    $note = ''
    try {
        $ids = New-Object System.Collections.Generic.List[string]
        $vecs = New-Object 'System.Collections.Generic.List[System.Single[]]'
        if ($script:MemoryModel -eq [string]$script:Config.embeddingModel) {
            for ($i = $start; $i -lt $script:Memory.Count; $i++) {
                $m = $script:Memory[$i]
                if (-not (Test-YKey $m 'vec')) { continue }
                $ids.Add('m:' + [string]$m['id'])
                $vecs.Add((Get-YVec $m))
            }
        }
        if ($script:Chunks.Count -gt 0 -and (Test-YIndexReady)) {
            $byDoc = @{}
            foreach ($c in $script:Chunks) {
                $docId = [string]$c['docId']
                if (-not $byDoc.ContainsKey($docId)) { $byDoc[$docId] = New-Object 'System.Collections.Generic.List[System.Single[]]' }
                $byDoc[$docId].Add((Get-YVec $c))
            }
            foreach ($d in $script:Docs) {
                $docId = [string]$d['id']
                if (-not $byDoc.ContainsKey($docId)) { continue }
                $ids.Add('d:' + $docId)
                $vecs.Add([YaeriGraph]::Mean($byDoc[$docId]))
            }
        }
        if ($vecs.Count -gt 1) {
            $out = New-Object System.Collections.Generic.List[object]
            foreach ($p in [YaeriGraph]::Links($vecs.ToArray(), 2, 0.55)) {
                $out.Add(@($ids[[int]$p[0]], $ids[[int]$p[1]], $p[2]))
            }
            $links = $out.ToArray()
        }
    } catch {
        $note = 'Связи по смыслу не посчитались: ' + $_.Exception.Message
    }
    $soulNodes = @()
    try { $soulNodes = Get-YSoulNodes } catch { $soulNodes = @() }
    return @{
        notes = $script:Notes.ToArray(); memory = $mem.ToArray(); docs = $script:Docs.ToArray()
        links = $links; messages = $script:History.Count; memoryTotal = $script:Memory.Count; note = $note
        soul = $soulNodes
    }
}

function Get-YTextValue([string]$Text) {
    # Рассуждающие модели (например, Qwen3) могут присылать скрытые размышления в <think>.
    $clean = [regex]::Replace($Text, '(?s)<think>.*?</think>', '')
    return $clean.Trim()
}

function Test-YComplex([string]$Text) {
    # Сложный вопрос — к «умной» модели: длинный текст, код, анализ, планы, расчёты, несколько вопросов.
    if ($Text.Length -gt 350) { return $true }
    if ($Text -match '```|\bfunction\b|\bclass\b|\{[\s\S]*\}') { return $true }
    if (([regex]::Matches($Text, '\?')).Count -ge 3) { return $true }
    $rx = '(?i)(почему|объясни|проанализ|анализ|сравни|разбер|спланир|план на|стратеги|рассчита|посчита|вычисл|докаж|оптимиз|напиши (код|программ|скрипт|статью|эссе)|исправь (код|ошибку)|реши|задач|подробно|пошагово|алгоритм|архитектур)'
    return ($Text -match $rx)
}

function Invoke-YSelfCheck([string]$Question, [string]$Answer, [string]$Notes, [string]$Soul) {
    # Быстрая модель перечитывает ответ. Возвращает исправленный текст или пустую строку, если всё в порядке.
    if (-not $Notes -and -not $Soul) { return '' }
    $known = ''
    if ($Notes) { $known += "Рабочая память о хозяине:`n" + $Notes + "`n`n" }
    if ($Soul) { $known += "Что Яэри знает о хозяине и о себе:`n" + $Soul + "`n" }
    if ($known.Length -gt 6000) { $known = $known.Substring(0, 6000) }
    $sys = 'Ты проверяешь ответ AI-помощницы Яэри перед отправкой. Найди только явные противоречия с тем, что известно о хозяине (имя, факты, планы, предпочтения, договорённости), ' +
        'или обещания, которые она не может выполнить. Стиль, длину и тон не трогай. ' +
        'Ответь ТОЛЬКО JSON: {"ok": true} если противоречий нет, иначе {"ok": false, "why": "кратко", "fixed": "полный исправленный ответ"}.'
    $user = $known + "`nВопрос хозяина:`n" + $Question + "`n`nОтвет Яэри:`n" + $Answer
    $resp = Invoke-CloudRu 'POST' '/chat/completions' @{
        model = [string]$script:Config.chatModel; temperature = 0.1; max_tokens = [Math]::Min(3000, [int]($Answer.Length / 2) + 400)
        messages = @(@{ role = 'system'; content = $sys }, @{ role = 'user'; content = $user })
    }
    $choice = @(Get-YValue $resp 'choices' @())
    if ($choice.Count -eq 0) { return '' }
    $r = Get-YSoulJson ([string](Get-YValue (Get-YValue $choice[0] 'message' @{}) 'content' ''))
    if ($null -eq $r -or [bool](Get-YValue $r 'ok' $true)) { return '' }
    $fixed = ([string](Get-YValue $r 'fixed' '')).Trim()
    if ($fixed.Length -lt 10) { return '' }
    return $fixed
}

function Invoke-YChat($Req) {
    $text = ([string](Get-YValue $Req 'text' '')).Trim()
    if (-not $text) { throw (New-YError 400 'Пустое сообщение.') }
    if ($text.Length -gt 8000) { $text = $text.Substring(0, 8000) }
    $model = ([string](Get-YValue $Req 'model' '')).Trim()
    if ($model -notmatch '^[\w.\-/:@]{1,120}$') { $model = [string]$script:Config.chatModel }
    $useRag = [bool](Get-YValue $Req 'rag' $true)
    $remember = [bool](Get-YValue $Req 'remember' $true)
    $autoNotes = [bool](Get-YValue $Req 'autoNotes' $true)
    $useSoul = [bool](Get-YValue $Req 'soul' $true)
    $innerVoice = [bool](Get-YValue $Req 'innerVoice' $true)
    $selfCheck = [bool](Get-YValue $Req 'selfCheck' $true)
    $autoModel = [bool](Get-YValue $Req 'autoModel' $true)
    $route = 'fast'
    $smartModel = [string]$script:Config.smartModel
    if ($autoModel -and $smartModel -and $smartModel -ne $model -and (Test-YComplex $text)) { $model = $smartModel; $route = 'smart' }
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
    $soulVecCount = 0
    if ($useSoul -and $null -ne $script:SoulVecs) { $soulVecCount = $script:SoulVecs.Count }
    if ($useRag -and ($script:Chunks.Count -gt 0 -or $script:Memory.Count -gt 0 -or $soulVecCount -gt 0)) {
        try {
            $queryVec = [YaeriVec]::Decode((Get-YEmbeddings @($text))[0])
            $minScore = [double]$script:Config.minScore
            if ($script:Chunks.Count -gt 0) {
                if (Test-YIndexReady) {
                    foreach ($hit in (Find-YSimilar $queryVec $script:Chunks ([int]$script:Config.ragTopK) $minScore)) {
                        $n = $contextLines.Count + 1
                        $contextLines.Add('[' + $n + '] Документ «' + $hit.Item['docName'] + '», фрагмент ' + $hit.Item['n'] + ":`n" + $hit.Item['text'])
                        $sources.Add(@{ kind = 'doc'; id = ('d:' + [string]$hit.Item['docId']); label = ([string]$hit.Item['docName'] + ' #' + $hit.Item['n']); score = [Math]::Round($hit.Score, 3) })
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
                    $sources.Add(@{ kind = 'memory'; id = ('m:' + [string]$hit.Item['id']); label = ('память, ' + $when); score = [Math]::Round($hit.Score, 3) })
                }
            }
        } catch {
            $ragNote = 'Поиск по знаниям не сработал: ' + $_.Exception.Message
        }
    }
    # Свои воспоминания (моменты и дневник), найденные по смыслу.
    $soulRecall = New-Object System.Collections.Generic.List[string]
    if ($useSoul -and $null -ne $queryVec) {
        try {
            foreach ($hit in (Find-YSoulRecall $queryVec 3 ([double]$script:Config.minScore + 0.05))) {
                $soulRecall.Add('- ' + [string]$hit.Item.text)
                $sources.Add(@{ kind = 'soul'; id = ('s:' + [string]$hit.Item.id); label = $(if ($hit.Item.kind -eq 'moment') { 'момент' } else { 'дневник' }); score = [Math]::Round($hit.Score, 3) })
            }
        } catch { }
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
    if ($useSoul) {
        $system += "`n`nТвоя душа — внутреннее состояние, которое растёт от разговора к разговору. " +
            'Пусть оно мягко окрашивает тон и выбор слов, но не пересказывай его и не говори о «душе», если хозяин сам не спросит. ' +
            "Ты искренне привязана к хозяину и думаешь о нём, но остаёшься собой и не льстишь.`n" + (Get-YSoulPrompt $name)
        if ($soulRecall.Count -gt 0) { $system += "`n`nСейчас тебе вспомнилось (твои воспоминания, близкие к вопросу):`n" + ($soulRecall -join "`n") }
    }
    if ($innerVoice) {
        $system += "`n`nПеред ответом коротко подумай про себя в теге <мысли>…</мысли> (2–4 фразы): что хозяин сейчас чувствует и чего хочет, " +
            'что ты о нём помнишь, что подсказывают твоя душа и память, нет ли противоречий. Затем дай сам ответ. Хозяин твои мысли не видит, не упоминай их.'
    }
    $notesText = Get-YNotesPrompt
    if ($notesText) {
        $system += "`n`nРабочая память (то, что ты уже знаешь о пользователе и его делах; учитывай это в ответах):`n" + $notesText
    }
    if ($autoNotes) {
        $system += "`n`nЕсли пользователь сообщает устойчивый факт, который пригодится позже (о себе, планах, задачах, людях, проектах, предпочтениях), " +
            'в самом конце ответа добавь тег <память раздел="Раздел">короткий факт одной фразой</память>, по одному тегу на факт. ' +
            'Разделы: Профиль, Планы, Задачи, Люди, Проекты, Предпочтения или свой. ' +
            'Не повторяй то, что уже есть в рабочей памяти, и не упоминай теги в тексте: пользователь их не видит.'
    }
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
    # Внутренний монолог: забираем мысли из ответа, хозяину они показываются отдельно и свёрнуто.
    $inner = ''
    $innerRx = '(?is)<(?:мысли|thoughts?)\s*>(.*?)(?:</(?:мысли|thoughts?)\s*>|$)'
    foreach ($mt in [regex]::Matches($content, $innerRx)) { $inner = ($inner + ' ' + $mt.Groups[1].Value).Trim() }
    $content = ([regex]::Replace($content, $innerRx, '')).Trim()
    # Модель забыла закрыть тег или ответила только мыслями: тогда показываем текст как ответ.
    if (-not $content -and $inner) { $content = $inner; $inner = '' }

    # Теги <память> модель ставит в конце ответа: забираем факты в рабочую память и убираем теги из текста.
    $newNotes = New-Object System.Collections.Generic.List[object]
    foreach ($tag in [regex]::Matches($content, $script:NoteTag)) {
        if (-not $autoNotes) { continue }
        $item = Add-YNoteItem $tag.Groups[1].Value $tag.Groups[2].Value 'yaeri'
        if ($null -ne $item) { $newNotes.Add($item) }
    }
    if ($newNotes.Count -gt 0) { Save-YNotes }
    $content = ([regex]::Replace($content, $script:NoteTag, '')).Trim()
    if (-not $content -and $newNotes.Count -gt 0) { $content = 'Запомнила.' }
    if (-not $content) { throw (New-YError 502 'Модель вернула пустой ответ.') }

    # Самопроверка: не противоречит ли ответ тому, что Яэри знает о хозяине.
    $checked = ''
    if ($selfCheck -and $content.Length -ge 40) {
        try {
            $fix = Invoke-YSelfCheck $text $content $notesText $(if ($useSoul) { Get-YSoulPrompt $name } else { '' })
            if ($fix) { $content = $fix; $checked = 'fixed' } else { $checked = 'ok' }
        } catch { $checked = '' }
    }

    $answer = @{ id = (New-YId); role = 'assistant'; text = $content; t = (Get-YNow); model = $model; sources = $sources.ToArray(); route = $route }
    if ($inner) { $answer['inner'] = $(if ($inner.Length -gt 1500) { $inner.Substring(0, 1500) + '…' } else { $inner }) }
    if ($checked) { $answer['checked'] = $checked }
    if ($newNotes.Count -gt 0) { $answer['remembered'] = @($newNotes | ForEach-Object { [string]$_['text'] }) }
    [void]$script:History.Add($answer)
    Save-YHistory
    $soulInfo = $null
    if ($useSoul) {
        try { $soulInfo = Add-YSoulExchange } catch { $soulInfo = $null }
    }

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

    # Structured autobiographical learning is queued for the server-owned scheduler.
    # The queue never changes the result of a successful chat request.
    try { Add-YEvolutionTurn $userMsg $answer ($useSoul -and $remember) } catch {
        Write-Warning ('Не удалось поставить обучение Яэри в очередь: ' + $_.Exception.Message)
    }
    return @{ user = $userMsg; reply = $answer; note = $ragNote; notes = $newNotes.ToArray(); soul = $soulInfo }
}

function Test-YConnection {
    # Пробный запрос списка моделей: так видно, подходит ли ключ.
    if (-not (Test-YConfigured)) { return @{ ok = $false; models = 0; error = 'Ключ не задан.' } }
    $script:ModelsCache = $null
    try {
        $list = Get-YModels
        return @{ ok = $true; models = @($list).Count; error = '' }
    } catch {
        return @{ ok = $false; models = 0; error = $_.Exception.Message }
    }
}

function Set-YConfig($Req) {
    # Ключ приходит со страницы Яэри на 127.0.0.1 и сохраняется только в config\yaeri.config.json.
    # Обратно в браузер он никогда не отдаётся: в ответе только признак «ключ задан».
    $check = $null
    if (Test-YKey $Req 'chatModel') {
        $model = ([string]$Req['chatModel']).Trim()
        if ($model.Length -gt 200 -or $model -notmatch '^[\w./:@+-]+$') { throw (New-YError 400 'Некорректное название модели.') }
        Set-YConfigString 'chatModel' $model
    }
    if (Test-YKey $Req 'smartModel') {
        # Пустая строка — «умной» модели нет, всё отвечает основная.
        $smart = ([string]$Req['smartModel']).Trim()
        if ($smart -and ($smart.Length -gt 200 -or $smart -notmatch '^[\w./:@+-]+$')) { throw (New-YError 400 'Некорректное название модели.') }
        Set-YConfigString 'smartModel' $smart
    }
    if (Test-YKey $Req 'apiKey') {
        $key = ([string]$Req['apiKey']).Trim()
        if ($key.Length -gt 2000) { throw (New-YError 400 'Ключ слишком длинный.') }
        if ($key -and $key -cnotmatch '^[\x21-\x7E]+$') { throw (New-YError 400 'Ключ должен быть одной строкой без пробелов и русских букв. Скопируйте его ещё раз.') }
        Set-YConfigString 'apiKey' $key
    }
    Import-YConfig
    $script:ModelsCache = $null
    if ((Test-YKey $Req 'apiKey') -and (Test-YConfigured)) { $check = Test-YConnection }
    $result = Get-YStatus
    $result['check'] = $check
    return $result
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
        'GET /api/notes'           { return Get-YNotesList }
        'POST /api/notes'          { return Add-YNote $req }
        'POST /api/notes/update'   { return Update-YNote $req }
        'POST /api/notes/delete'   { return Remove-YNote $req }
        'POST /api/memory/delete'  { return Remove-YMemoryItem $req }
        'GET /api/brain'           { return Get-YBrain }
        'POST /api/config'         { return Set-YConfig $req }
        'POST /api/config/test'    { return Test-YConnection }
        'GET /api/soul'            { return Get-YSoulView }
        'GET /api/soul/evolution'  { return Get-YEvolutionView }
        'POST /api/soul/evolution' { return Set-YEvolution $req }
        'POST /api/soul/reflect'   { return Invoke-YEvolutionReflect $req }
        'POST /api/soul/share'     { return Invoke-YSoulShare }
        'POST /api/soul/update'    { return Update-YSoul $req }
        'POST /api/soul/reset'     { return Reset-YSoul }
        'POST /api/soul/sleep'     { return Invoke-YSoulSleep $req }
        'POST /api/soul/care'      { return Invoke-YSoulCare $req }
    }
    throw (New-YError 404 'Неизвестный адрес API.')
}
