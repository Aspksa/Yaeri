#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($file in (Get-ChildItem (Join-Path $root 'launcher') -Filter '*.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw ($file.Name + ': ' + ($parseErrors | Out-String)) }
}
. (Join-Path $root 'launcher/yaeri-api.ps1')
$script:DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-understanding-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($script:DataDir)
$script:EvoFile = Join-Path $script:DataDir 'soul-evolution.json'
$script:CurFile = Join-Path $script:DataDir 'soul-curiosity.json'
$script:UndFile = Join-Path $script:DataDir 'soul-understanding.json'
$script:Config = @{ apiKey = 'test-key'; chatModel = 'm'; smartModel = ''; embeddingModel = 'e'; minScore = 0.3 }
$script:Notes = New-Object System.Collections.ArrayList
$script:History = New-Object System.Collections.ArrayList
$script:ModelCalls = 0
function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
    $script:ModelCalls++
    return '{"lessons":[{"i":1,"rule":"Когда хозяин просит кратко, я отвечаю в одну-две фразы."}]}'
}
try {
    Import-YSoul
    Import-YEvolution
    Import-YCuriosity
    Import-YUnderstanding

    # Чтение состояния по тексту
    if ((Get-YUserState 'Я так устал, совсем нет сил').tone -ne 'tired') { throw 'Tired state not detected.' }
    if ((Get-YUserState 'Срочно, быстрее, некогда объяснять').tone -ne 'hurry') { throw 'Hurry state not detected.' }
    if ((Get-YUserState 'Меня всё бесит, я на нервах').tone -ne 'tense') { throw 'Tense state not detected.' }
    $calm = Get-YUserState 'Расскажи, как работает индексация документов.'
    if ($calm.tone -ne 'neutral' -or $calm.confidence -ne 0) { throw 'Neutral text misread.' }

    # Темы: здоровье и деньги по умолчанию «не использовать без запроса»
    if ((Get-YTopicMode 'health') -ne 'hold' -or (Get-YTopicMode 'work') -ne 'open') { throw 'Topic defaults incorrect.' }
    if (Test-YTopicVisible 'У меня болит спина') { throw 'Held topic leaked into context.' }
    if (-not (Test-YTopicVisible 'Хочу купить новый стол')) { throw 'Open text hidden.' }
    Update-YUndTurn 'Давай поговорим про здоровье: болит спина'
    if (-not (Test-YTopicVisible 'У меня болит спина')) { throw 'Mentioning the topic must lift the hold for this turn.' }
    $script:UTurn = @{ t = 0L; allowed = @() }

    # Фильтрация в промпте души
    $script:Soul.owner.worries = @('болит спина', 'сроки проекта')
    $prompt = Get-YSoulPrompt 'Тест'
    if ($prompt -match 'болит спина') { throw 'Held worry present in soul prompt.' }
    if ($prompt -notmatch 'сроки проекта') { throw 'Visible worry missing from soul prompt.' }

    # «Не запоминать» блокирует запись знаний
    [void](Set-YUndTopic @{ topic = 'money'; mode = 'off' })
    Add-YEvolutionFact 'Долг' 'Должен 100 тысяч' 'я должен 100 тысяч' 'm1' 0.9
    if ($script:Evo.facts.Count -ne 0) { throw 'Off topic was memorised.' }
    $threw = $false
    try { [void](Set-YUndTopic @{ topic = 'nothing'; mode = 'open' }) } catch { $threw = $true }
    if (-not $threw) { throw 'Unknown topic accepted.' }

    # Карта человека: только цитаты хозяина
    $item = @{ id = 'm2'; user = 'Моя сестра Аня живёт в Казани, а по вечерам я гуляю в лесу. Мне помогает чай.' }
    $json = @{ map = @(
        @{ section = 'people'; text = 'Сестра Аня живёт в Казани'; topic = 'family'; quote = 'Моя сестра Аня живёт в Казани' }
        @{ section = 'habits'; text = 'Гуляет в лесу по вечерам'; topic = 'other'; quote = 'по вечерам я гуляю в лесу' }
        @{ section = 'helps'; text = 'Помогает кофе'; topic = 'other'; quote = 'Мне помогает кофе' }
        @{ section = 'nope'; text = 'Не тот раздел'; topic = 'other'; quote = 'Мне помогает чай' }
    ) }
    Add-YUnderstandingLearning $item $json
    if ($script:Und.map.Count -ne 2) { throw ('Map should keep only grounded valid entries, got ' + $script:Und.map.Count) }
    $mapPrompt = Get-YMapPrompt
    if ($mapPrompt -notmatch 'Аня' -or $mapPrompt -notmatch 'лесу') { throw 'Map prompt incomplete.' }
    [void](Set-YUndTopic @{ topic = 'family'; mode = 'hold' })
    if ((Get-YMapPrompt) -match 'Аня') { throw 'Held family entry leaked into map prompt.' }
    $view = Get-YUnderstandingView
    $people = $view.sections | Where-Object { $_.id -eq 'people' }
    if (-not $people.entries[0].hidden) { throw 'Held entry must be marked hidden in the view.' }
    [void](Set-YUndMap @{ action = 'add'; section = 'places'; text = 'Любит озеро у дома' })
    if ($script:Und.map.Count -ne 3) { throw 'Manual entry not added.' }
    $placeId = [string]@($script:Und.map | Where-Object { $_.section -eq 'places' })[0].id
    [void](Set-YUndMap @{ action = 'delete'; id = $placeId })
    if ($script:Und.map.Count -ne 2) { throw 'Entry not deleted.' }

    # Вопросы по пробелам: один, редко, не в плохом настроении
    $script:Und.state = Get-YUserState 'Я так устал, нет сил'
    if (Get-YGapPrompt) { throw 'Gap question asked while the owner is tired.' }
    $script:Und.state = Get-YUserState 'Привет!'
    $gap = Get-YGapPrompt
    if (-not $gap -or $gap -notmatch 'ОДНО') { throw 'Gap question missing.' }
    if (Get-YGapPrompt) { throw 'Gap question repeated within the cooldown.' }
    $gaps = @(Get-YUndGaps)
    if (@($gaps | Where-Object { $_.id -eq 'people' }).Count -ne 0) { throw 'A filled section must not be a gap.' }
    [void](Set-YUndGap @{ section = 'projects'; action = 'dismiss' })
    $script:Und.lastGapAt = 0L
    $script:Und.gapAsked = @{}
    $next = Get-YGapPrompt
    if ($next -match 'главное дело или проект') { throw 'Dismissed gap was asked.' }

    # Оценки ответов
    [void]$script:History.Add(@{ id = 'u1'; role = 'user'; text = 'Объясни кратко, что такое RAG'; t = 1 })
    [void]$script:History.Add(@{ id = 'a1'; role = 'assistant'; text = 'Очень длинный ответ про RAG на пять абзацев...'; t = 2 })
    $threw = $false
    try { [void](Add-YRating @{ id = 'zzz'; score = -1 }) } catch { $threw = $true }
    if (-not $threw) { throw 'Rating of unknown message accepted.' }
    $threw = $false
    try { [void](Add-YRating @{ id = 'a1'; score = 5 }) } catch { $threw = $true }
    if (-not $threw) { throw 'Invalid score accepted.' }
    $v = Add-YRating @{ id = 'a1'; score = -1; note = 'Просил кратко' }
    if ($v.ratings.down -ne 1 -or $v.ratings.up -ne 0) { throw 'Down rating not counted.' }
    if ($script:Und.ratings[0].user -notmatch 'кратко') { throw 'Rated exchange not captured.' }
    $script:Cur.lessons.Clear()
    $script:ModelCalls = 0
    Invoke-YUnderstandingRatings
    if ($script:ModelCalls -ne 1) { throw 'Ratings should use one model call.' }
    if (@($script:Cur.lessons | Where-Object { [string]$_.from -eq 'rating:a1' -and $_.rule }).Count -ne 1) { throw 'Lesson from rating missing.' }
    if (@(Get-YPendingRatings).Count -ne 0) { throw 'Rating stayed pending.' }
    Invoke-YUnderstandingRatings
    if ($script:ModelCalls -ne 1) { throw 'Processed rating was analysed again.' }
    if ((Get-YCuriosityPrompt) -notmatch 'в одну-две фразы') { throw 'Rating lesson missing from curiosity prompt.' }
    $v = Add-YRating @{ id = 'a1'; score = 1 }
    if ($v.ratings.up -ne 1 -or $v.ratings.down -ne 0) { throw 'Rating change not applied.' }
    $v = Add-YRating @{ id = 'a1'; score = 0 }
    if ($v.ratings.up -ne 0 -or $script:Und.ratings.Count -ne 0) { throw 'Rating not removed.' }

    # Планировщик сам берёт разбор плохих оценок, даже при выключенной активности
    [void](Add-YRating @{ id = 'a1'; score = -1; note = 'Снова слишком длинно' })
    [void](Set-YGrowthSettings @{ intensity = 'off'; dailyLimit = 0 })
    $script:Evo.queue.Clear()
    $script:Evo.lastAction = 0L
    $script:Evo.retryAfter = 0L
    $script:Und.lastRatings = 0L
    $script:ModelCalls = 0
    Invoke-YEvolutionTick
    if ($script:Cur.ran -ne 'ratings' -or $script:ModelCalls -ne 1) { throw ('Scheduler did not process the rating: ran=' + $script:Cur.ran) }
    [void](Add-YRating @{ id = 'a1'; score = 0 })

    # Сохранение, перезагрузка, сброс
    [void](Add-YRating @{ id = 'a1'; score = 1 })
    Save-YUnderstanding
    Import-YUnderstanding
    if ($script:Und.map.Count -ne 2 -or $script:Und.ratings.Count -ne 1) { throw 'Understanding persistence failed.' }
    if ((Get-YTopicMode 'money') -ne 'off' -or (Get-YTopicMode 'family') -ne 'hold') { throw 'Topic modes not persisted.' }
    [void](Clear-YUnderstanding)
    if ($script:Und.map.Count -ne 0 -or $script:Und.ratings.Count -ne 0) { throw 'Reset incomplete.' }
    if ((Get-YTopicMode 'money') -ne 'off') { throw 'Reset must preserve topic settings.' }
    Write-Host 'Soul Understanding tests passed.' -ForegroundColor Green
} catch {
    # В CI (Windows PowerShell 5.1) нужен стек: без него неясно, какой шаг упал.
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    throw
} finally {
    if (Test-Path $script:DataDir) { Remove-Item $script:DataDir -Force -Recurse }
}
