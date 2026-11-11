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
$script:DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-curiosity-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($script:DataDir)
$script:EvoFile = Join-Path $script:DataDir 'soul-evolution.json'
$script:Y3File = Join-Path $script:DataDir 'soul3.json'
$script:CurFile = Join-Path $script:DataDir 'soul-curiosity.json'
$script:Config = @{ apiKey = 'test-key'; chatModel = 'm'; smartModel = ''; embeddingModel = 'e'; minScore = 0.3 }
$script:Chunks = New-Object System.Collections.ArrayList
$script:Memory = New-Object System.Collections.ArrayList
$script:ModelCalls = 0
$script:ModelReply = '{}'
# Подменяем обращение к модели: тест не ходит в сеть.
function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
    $script:ModelCalls++
    return $script:ModelReply
}
try {
    Import-YSoul
    Import-YEvolution
    Import-Y3
    Import-YCuriosity
    if ($script:Cur.intensity -ne 'normal' -or $script:Cur.dailyLimit -ne 60) { throw 'Curiosity defaults incorrect.' }

    # Настройки и лимит
    [void](Set-YGrowthSettings @{ intensity = 'active'; dailyLimit = 3 })
    if ($script:Cur.intensity -ne 'active' -or $script:Cur.dailyLimit -ne 3) { throw 'Settings not saved.' }
    $threw = $false
    try { [void](Set-YGrowthSettings @{ intensity = 'wild' }) } catch { $threw = $true }
    if (-not $threw) { throw 'Unknown intensity accepted.' }
    if (-not (Test-YCurBudget)) { throw 'Budget should be open.' }
    Add-YCurUsage 3
    if (Test-YCurBudget) { throw 'Budget should be exhausted.' }
    [void](Set-YGrowthSettings @{ dailyLimit = 0 })
    if (-not (Test-YCurBudget)) { throw 'Zero limit must mean unlimited.' }

    # Уроки на ошибках
    Add-YEvolutionCorrection 'Назвала другой город' 'Верно: Париж' 'Париж' 'msg1'
    $script:ModelReply = '{"lessons":[{"i":1,"rule":"Когда не уверена в городе, я уточняю его у хозяина."}]}'
    $script:ModelCalls = 0
    Invoke-YCuriosityLessons
    if ($script:ModelCalls -ne 1) { throw 'Lessons should use one model call.' }
    if (@($script:Cur.lessons | Where-Object { $_.rule }).Count -ne 1) { throw 'Lesson not created.' }
    if (@(Get-YCurPendingCorrections).Count -ne 0) { throw 'Correction was not marked as reviewed.' }
    if ((Get-YCuriosityPrompt) -notmatch 'Уроки') { throw 'Lessons absent from prompt.' }

    # Любопытство: догадка — гипотеза, а не факт
    Add-YEvolutionFact 'Увлечение' 'Рисует' 'Я люблю рисовать' 'msg2' 0.9
    $script:Soul.lastSeen = 1
    $script:ModelCalls = 0
    $script:ModelReply = '{"questions":[{"q":"Чем хозяин любит заниматься по вечерам?"}]}'
    # Первый вызов вернёт вопросы, второй — ответы.
    function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
        $script:ModelCalls++
        if ($script:ModelCalls -eq 1) { return '{"questions":[{"q":"Чем хозяин любит заниматься по вечерам?"},{"q":"Какой цвет любимый?"}]}' }
        return '{"answers":[{"i":1,"answer":"Возможно, рисует по вечерам.","basis":"memory","confidence":0.7},{"i":2,"answer":"Не знаю","basis":"none","confidence":0.1}]}'
    }
    $factsBefore = $script:Evo.facts.Count
    Invoke-YCuriosityWonder
    if ($script:ModelCalls -ne 2) { throw 'Wonder should use two model calls.' }
    if ($script:Evo.facts.Count -ne $factsBefore) { throw 'Inference leaked into facts.' }
    if ($script:Cur.insights.Count -ne 1 -or $script:Cur.insights[0].status -ne 'hypothesis') { throw 'Insight must be a hypothesis.' }
    if ($script:Cur.questions.Count -ne 1) { throw 'Unanswered question must stay open.' }
    if ((Get-YCuriosityPrompt) -notmatch 'НЕ факты') { throw 'Hypothesis label missing from prompt.' }
    $id = [string]$script:Cur.insights[0].id
    [void](Set-YGrowthInsight @{ id = $id; action = 'confirm' })
    if ($script:Cur.insights[0].status -ne 'confirmed') { throw 'Confirm failed.' }
    if ((Get-YCuriosityPrompt) -notmatch 'Подтверждено хозяином') { throw 'Confirmed insight missing from prompt.' }

    # Учебные цели: прогресс честный и ограниченный
    function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
        $script:ModelCalls++
        if ($User -match 'id=') {
            $gid = [regex]::Match($User, 'id=(\w+)').Groups[1].Value
            return ('{"goals":[{"id":"' + $gid + '","delta":99,"note":"практика","steps_done":[1]}],"new":[]}')
        }
        return '{"goals":[],"new":[{"text":"Лучше поддерживать в стрессе","why":"хозяин тревожится","steps":["Узнать, что помогает","Предложить маленький шаг"]},{"text":"Запоминать детали проектов","why":"помогать с делами","steps":["Фиксировать сроки"]}]}'
    }
    $script:Soul.exchanges = 10
    Invoke-YCuriosityGoals
    if (@($script:Cur.goals | Where-Object { $_.status -eq 'active' }).Count -ne 2) { throw 'Two learning goals expected.' }
    $goal = $script:Cur.goals[0]
    $goal.lastEx = [long]$script:Soul.exchanges   # практики не было
    Invoke-YCuriosityGoals
    if ([int]$goal.progress -gt 3 + 8) { throw ('Progress without practice was not capped: ' + $goal.progress) }
    $goal.lastEx = 0L
    $before = [int]$goal.progress
    Invoke-YCuriosityGoals
    if ([int]$goal.progress - $before -gt 12 + 8) { throw 'Progress with practice exceeded the cap.' }
    if ([int]$goal.progress -ge 100) { throw 'Goal must not complete in a few runs.' }

    # Ряд по дням и вид для графиков
    Update-YCurSeries
    $view = Get-YGrowthView
    if ($view.series.Count -lt 1 -or $view.stages.Count -ne 9 -or $view.goals.Count -lt 2) { throw 'Growth view incomplete.' }
    if ($view.series[$view.series.Count - 1].lessons -ne 1) { throw 'Series lessons incorrect.' }
    if ($null -eq $view.stages[0].t -or [long]$view.stages[0].t -le 0) { throw 'First stage date missing.' }
    # Просмотр роста (GET) не пишет файл: иначе фоновая AI-задача видит конфликт и теряет результат.
    $script:Soul.xp = [long]$script:Soul.xp + 1
    $curHash = (Get-FileHash -LiteralPath $script:CurFile).Hash
    [void](Get-YGrowthView)
    if ((Get-FileHash -LiteralPath $script:CurFile).Hash -ne $curHash) { throw 'Growth view must not write soul-curiosity.json.' }

    # Планировщик: лимит не даёт запускать задачи, «Учиться сейчас» его обходит
    $script:Evo.lastAction = 0L
    $script:Evo.retryAfter = 0L
    Set-YGrowthSettings @{ dailyLimit = 1 } | Out-Null
    Add-YCurUsage 5
    $script:Evo.queue.Clear()
    $script:ModelCalls = 0
    Invoke-YEvolutionTick
    if ($script:ModelCalls -ne 0) { throw 'Tick ran despite exhausted budget.' }

    # Сбой даёт растущую паузу и не ломает планировщик
    function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) { throw 'сеть недоступна' }
    Add-YEvolutionCorrection 'Ошибка' 'Правильно иначе' 'иначе' 'msg9'
    Invoke-YEvolutionTick $true
    if (-not $script:Evo.lastError -or $script:Evo.retryAfter -le (Get-YNow)) { throw 'Failure backoff not applied.' }
    $first = [long]$script:Evo.retryAfter - (Get-YNow)
    if ($first -gt 6 * 60000) { throw 'First backoff should be about 5 minutes.' }

    # Сохранение и сброс
    Save-YCuriosity
    Import-YCuriosity
    if ($script:Cur.lessons.Count -lt 1 -or $script:Cur.goals.Count -lt 2 -or $script:Cur.intensity -ne 'active') { throw 'Curiosity persistence failed.' }
    [void](Clear-YCuriosity)
    if ($script:Cur.lessons.Count -ne 0 -or $script:Cur.goals.Count -ne 0 -or $script:Cur.intensity -ne 'active') { throw 'Curiosity reset incorrect.' }
    Write-Host 'Soul Curiosity tests passed.' -ForegroundColor Green
} catch {
    # В CI (Windows PowerShell 5.1) нужен стек: без него неясно, какой шаг упал.
    Write-Host ('FAILED: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    throw
} finally {
    if (Test-Path $script:DataDir) { Remove-Item $script:DataDir -Force -Recurse }
}
