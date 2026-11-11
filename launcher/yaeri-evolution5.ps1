#requires -Version 5.1
# Evolution 5.0: persistent, reviewable research and learning state.
# Rules and experiment ideas are proposals, not facts or executable code.
$script:YE5Collections = @('goals','gaps','hypotheses','experiments','concepts','strategies','errors','calibrations','logs','transfers')
$script:YE5Caps = @{ goals=50; gaps=90; hypotheses=90; experiments=80; concepts=70; strategies=35; errors=160; calibrations=160; logs=200; transfers=60 }
$script:YE5Methods = @('evidence-first','alternatives','clarify','concise','cross-domain','deep-analysis','uncertainty','causal-check')
$script:YE5Domains = @('research','reasoning','communication','learning','planning','creativity')
$script:YE5MethodRules = @{
    'evidence-first' = 'Отделяй факты от предположений, называй источники и проверяй цитаты.'
    'alternatives' = 'При сложном выборе сравни не менее двух вариантов и их риски.'
    'clarify' = 'Если существенных данных нет, задай один точный уточняющий вопрос вместо выдумывания.'
    'concise' = 'Для простого запроса отвечай прямо и кратко без лишних рассуждений.'
    'cross-domain' = 'Сравни две области и явно обозначь, что аналогия не доказывает вывод.'
    'deep-analysis' = 'Раздели сложную задачу на шаги, проверь допущения и альтернативы.'
    'uncertainty' = 'Отмечай неопределённость и не выдавай вероятности без проверки.'
    'causal-check' = 'Различай причинную связь и корреляцию, ищи альтернативные объяснения.'
}
function Import-YE5 {
    $script:YE5File = Join-Path $script:DataDir 'evolution5.json'
    $raw = $null
    try { $raw = Read-YJsonFile $script:YE5File } catch { $raw = $null }
    $script:YE5 = @{ version = 1; enabled = [bool](Get-YValue $raw 'enabled' $true)
        periodic = [bool](Get-YValue $raw 'periodic' $false)
        lastCycle = [long](Get-YNum (Get-YValue $raw 'lastCycle' 0) 0)
        lastResearch = [long](Get-YNum (Get-YValue $raw 'lastResearch' 0) 0)
        lastMode = ''; trials = [long](Get-YNum (Get-YValue $raw 'trials' 0) 0)
    }
    foreach ($key in $script:YE5Collections) {
        $script:YE5[$key] = Get-YEvoArray (Get-YValue $raw $key @())
    }
}
function Save-YE5 {
    $plain = @{}
    foreach ($key in @($script:YE5.Keys)) {
        if ($script:YE5Collections -contains [string]$key) {
            $limit = [int]$script:YE5Caps[[string]$key]
            while ($script:YE5[$key].Count -gt $limit) { $script:YE5[$key].RemoveAt(0) }
            $plain[$key] = $script:YE5[$key].ToArray()
        } else { $plain[$key] = $script:YE5[$key] }
    }
    Write-YJsonFile $script:YE5File (ConvertTo-YPlain $plain)
}
function Test-YE5RecordVisible($Item) {
    # Re-evaluate current privacy settings on read, not only on save.
    foreach ($key in @('title','question','cause','effect','idea','note','claim','text','example','next','prediction','alternative','basis')) {
        $value=[string](Get-YValue $Item $key '')
        if ($value -and -not (Test-YTopicVisible $value)) { return $false }
    }
    return $true
}
function Get-YE5Visible([string]$Collection,[int]$Top = 30) {
    if ($script:YE5Collections -notcontains $Collection) { return @() }
    return @($script:YE5[$Collection] | Where-Object { Test-YE5RecordVisible $_ } | Select-Object -Last $Top)
}
function Get-YE5Item([string]$Collection,[string]$Id) {
    if ($script:YE5Collections -notcontains $Collection) { return $null }
    foreach ($x in $script:YE5[$Collection]) { if ([string]$x.id -eq $Id) { return $x } }
    return $null
}
function Test-YE5Text([string]$Text) {
    if (-not $Text.Trim()) { return $false }
    if (-not (Test-YTopicVisible $Text)) { return $false }
    return $true
}
function Add-YE5Log([string]$Kind,[string]$Text,[string]$ItemId = '') {
    [void]$script:YE5.logs.Add(@{ id=(New-YId); t=(Get-YNow); kind=$Kind
        text=(Get-YCleanLine $Text 240); itemId=$ItemId })
}
function Set-YE5Settings($Req) {
    foreach ($key in @('enabled','periodic')) {
        if (Test-YKey $Req $key) { $script:YE5[$key] = [bool]$Req[$key] }
    }
    Save-YE5
    return Get-YE5View
}
function Add-YE5Gap([string]$Question,[string]$Domain = 'research',[string]$Source = 'owner') {
    $question = Get-YCleanLine $Question 220
    if (-not (Test-YE5Text $question)) { throw (New-YError 400 'Уточните разрешённую тему исследования.') }
    if ($script:YE5Domains -notcontains $Domain) { $Domain = 'research' }
    foreach ($x in $script:YE5.gaps) {
        if ([string]$x.status -eq 'open' -and (Test-YCurSame ([string]$x.question) $question)) { return $x }
    }
    $item = @{ id=(New-YId); question=$question; domain=$Domain; source=$Source; status='open'
        t=(Get-YNow); answered=''; evidence=(New-YEvidence $(if ($Source -eq 'owner') {'user_manual'} else {'assistant_hypothesis'}) $Source '' 0) }
    [void]$script:YE5.gaps.Add($item)
    Add-YE5Log 'gap' ('Обнаружен пробел: ' + $question) $item.id
    Save-YE5
    return $item
}
function Add-YE5Hypothesis($Req) {
    $cause = Get-YCleanLine ([string](Get-YValue $Req 'cause' '')) 180
    $effect = Get-YCleanLine ([string](Get-YValue $Req 'effect' '')) 180
    $basis = Get-YCleanLine ([string](Get-YValue $Req 'basis' '')) 250
    if (-not (Test-YE5Text ($cause + ' ' + $effect))) { throw (New-YError 400 'Нужна допустимая гипотеза.') }
    if (-not $cause -or -not $effect) { throw (New-YError 400 'Укажите предполагаемую причину и следствие.') }
    $item = @{ id=(New-YId); cause=$cause; effect=$effect; basis=$basis; status='unverified'
        alternatives=@(); t=(Get-YNow); reviewed=0L; confidence=0.0
        evidence=(New-YEvidence 'assistant_hypothesis' '' '' 0) }
    [void]$script:YE5.hypotheses.Add($item)
    Add-YE5Log 'hypothesis' 'Предложена проверяемая причинная гипотеза.' $item.id
    Save-YE5
    return $item
}
function Add-YE5Experiment($Req) {
    $hypo = Get-YE5Item 'hypotheses' ([string](Get-YValue $Req 'hypothesisId' ''))
    if ($null -eq $hypo) { throw (New-YError 404 'Сначала выберите гипотезу.') }
    $alternative = Get-YCleanLine ([string](Get-YValue $Req 'alternative' '')) 230
    $prediction = Get-YCleanLine ([string](Get-YValue $Req 'prediction' '')) 230
    $measure = Get-YCleanLine ([string](Get-YValue $Req 'measure' '')) 170
    if (-not $prediction -or -not $alternative -or -not $measure -or -not (Test-YE5Text ($prediction+' '+$measure+' '+$alternative))) {
        throw (New-YError 400 'Нужны прогноз, альтернативное объяснение и способ проверки.')
    }
    $item = @{ id=(New-YId); hypothesisId=[string]$hypo.id; alternative=$alternative
        prediction=$prediction; measure=$measure; result=''; status='proposed'
        t=(Get-YNow); verified=0L; evidence=(New-YEvidence 'assistant_hypothesis' '' '' 0) }
    [void]$script:YE5.experiments.Add($item)
    Add-YE5Log 'experiment' 'Подготовлен мысленный эксперимент с проверяемым результатом.' $item.id
    Save-YE5
    return $item
}
function Set-YE5Experiment($Req) {
    $item = Get-YE5Item 'experiments' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $item) { throw (New-YError 404 'Эксперимент не найден.') }
    $result = [string](Get-YValue $Req 'result' '')
    if (@('supported','refuted','unclear') -notcontains $result) { throw (New-YError 400 'Укажите подтверждено, опровергнуто или неизвестно.') }
    if ([string]$item.status -eq 'reviewed') { throw (New-YError 409 'Этот эксперимент уже оценён.') }
    $item.result = $result; $item.status='reviewed'; $item.verified=(Get-YNow)
    $hypo = Get-YE5Item 'hypotheses' ([string]$item.hypothesisId)
    if ($null -ne $hypo) { $hypo.status = $(if ($result -eq 'unclear') {'unverified'} else {'owner-reviewed'}) }
    Add-YE5Log 'experiment-review' ('Хозяин оценил проверку: ' + $result) $item.id
    Save-YE5
    return Get-YE5View
}
function Add-YE5Concept($Req) {
    $title = Get-YCleanLine ([string](Get-YValue $Req 'title' '')) 110
    $idea = Get-YCleanLine ([string](Get-YValue $Req 'idea' '')) 330
    $refs = @((Get-YValue $Req 'sources' @()) | Select-Object -First 5)
    if (-not $title -or -not $idea -or -not (Test-YE5Text ($title+' '+$idea))) { throw (New-YError 400 'Укажите название и содержание концепции.') }
    $grounded = New-Object System.Collections.Generic.List[string]
    foreach ($ref in $refs) {
        $id = [string]$ref
        foreach ($list in @(@($script:Evo.facts),@($script:Evo.episodes))) {
            foreach ($x in $list) {
                if ([string]$x.id -eq $id -and (Test-YTopicVisible ([string](Get-YValue $x 'text' ([string](Get-YValue $x 'value' '')))))) { $grounded.Add($id); break }
            }
        }
    }
    if ($grounded.Count -lt 2) { throw (New-YError 400 'Для новой концепции нужны минимум два разрешённых независимых источника памяти.') }
    $item = @{ id=(New-YId); title=$title; idea=$idea; sources=$grounded.ToArray()
        status='proposed'; t=(Get-YNow); evidence=(New-YEvidence 'assistant_hypothesis' '' '' 0) }
    [void]$script:YE5.concepts.Add($item)
    Add-YE5Log 'concept' 'Создана новая концепция на основе нескольких источников.' $item.id
    Save-YE5
    return $item
}
function Set-YE5Concept($Req) {
    $item=Get-YE5Item 'concepts' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $item) { throw (New-YError 404 'Концепция не найдена.') }
    if ($item.status -ne 'proposed') { throw (New-YError 409 'Концепция уже рассмотрена.') }
    $choice=[string](Get-YValue $Req 'action' '')
    if (@('approve','reject') -notcontains $choice) { throw (New-YError 400 'Недопустимое решение.') }
    $item.status = $(if ($choice -eq 'approve') {'approved'} else {'rejected'})
    $item.decided = Get-YNow
    Save-YE5
    return Get-YE5View
}
function Add-YE5Goal($Req) {
    $title=Get-YCleanLine ([string](Get-YValue $Req 'title' '')) 170
    $domain=[string](Get-YValue $Req 'domain' 'learning')
    if ($script:YE5Domains -notcontains $domain) { $domain='learning' }
    if (-not (Test-YE5Text $title)) { throw (New-YError 400 'Укажите разрешённую цель.') }
    $impact = [int](Limit-YNum (Get-YNum (Get-YValue $Req 'impact' 3) 3) 1 5)
    $urgency=[int](Limit-YNum (Get-YNum (Get-YValue $Req 'urgency' 3) 3) 1 5)
    $effort=[int](Limit-YNum (Get-YNum (Get-YValue $Req 'effort' 3) 3) 1 5)
    $owner=[bool](Get-YValue $Req 'ownerApproved' $false)
    $item=@{ id=(New-YId); title=$title; domain=$domain; status=$(if ($owner) {'active'} else {'proposed'})
        impact=$impact; urgency=$urgency; effort=$effort; t=(Get-YNow); lastStep=0L
        log=@(); progress=0; next='Изучить источники и записать проверяемый вопрос.'
        evidence=(New-YEvidence $(if ($owner) {'user_manual'} else {'assistant_hypothesis'}) '' '' 0) }
    [void]$script:YE5.goals.Add($item)
    Add-YE5Log 'goal' ('Новая долгосрочная учебная цель: ' + $title) $item.id
    Save-YE5
    return $item
}
function Get-YE5Priority($Goal) {
    return [Math]::Round(0.5 * [int]$Goal.impact + 0.35 * [int]$Goal.urgency - 0.15 * [int]$Goal.effort,2)
}
function Set-YE5Goal($Req) {
    $goal=Get-YE5Item 'goals' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $goal) { throw (New-YError 404 'Цель не найдена.') }
    $action=[string](Get-YValue $Req 'action' '')
    if (@('approve','pause','resume','complete','cancel','step') -notcontains $action) { throw (New-YError 400 'Недопустимое действие.') }
    if ($action -eq 'approve' -and $goal.status -eq 'proposed') { $goal.status='active' }
    elseif ($action -eq 'pause' -and $goal.status -eq 'active') { $goal.status='paused' }
    elseif ($action -eq 'resume' -and $goal.status -eq 'paused') { $goal.status='active' }
    elseif (@('complete','cancel') -contains $action -and @('active','paused') -contains $goal.status) { $goal.status=$(if ($action -eq 'complete'){'done'}else{'cancelled'}) }
    elseif ($action -eq 'step' -and $goal.status -eq 'active') {
        $step=Get-YCleanLine ([string](Get-YValue $Req 'note' '')) 240
        if (-not (Test-YE5Text $step)) { throw (New-YError 400 'Нужен отчёт о выполненном шаге.') }
        $goal.log = @(@($goal.log | Select-Object -Last 19) + @(@{t=(Get-YNow);text=$step;source='owner'}))
        $goal.lastStep = Get-YNow
        $goal.progress = [Math]::Min(90,[int]$goal.progress + 15)
        $goal.next = Get-YCleanLine ([string](Get-YValue $Req 'next' 'Проверить результат и выбрать следующий шаг.')) 200
    } else { throw (New-YError 409 'Это действие нельзя применить к текущему состоянию цели.') }
    Add-YE5Log 'goal-action' ('Состояние или шаг цели: '+$action) $goal.id
    Save-YE5
    return Get-YE5View
}
function Get-YE5RankedGoals {
    return @(Get-YE5Visible 'goals' 50 | Where-Object { @('proposed','active','paused') -contains [string]$_.status } |
        ForEach-Object { @{ id=$_.id; title=$_.title; status=$_.status; priority=(Get-YE5Priority $_); impact=$_.impact; urgency=$_.urgency; effort=$_.effort; next=$_.next; progress=$_.progress; domain=$_.domain } } |
        Sort-Object priority -Descending)
}
function Get-YE5LearningReport {
    # Compare calibrated probability forecasts rather than just how often
    # the predicted event happened. A method predicting "no" may be right.
    $res=@{}
    foreach ($name in $script:YE5Methods) {
        $res[$name]=@{verified=0;success=0;failure=0;brierSum=0.0;brier=$null}
    }
    foreach ($cal in $script:YE5.calibrations) {
        if ([string]$cal.status -ne 'verified') { continue }
        $method=[string]$cal.method
        if (-not $res.ContainsKey($method)) { continue }
        $res[$method].verified++
        $p=[double]$cal.probability / 100.0
        $res[$method].brierSum=[double]$res[$method].brierSum +
            [Math]::Pow($p-[double]$cal.outcome,2)
        if ([int]$cal.outcome -eq 1) { $res[$method].success++ } else { $res[$method].failure++ }
    }
    $best=''
    $bestError=[double]::PositiveInfinity
    foreach ($method in $script:YE5Methods) {
        $n=[int]$res[$method].verified
        if ($n -gt 0) {
            $res[$method].brier=[Math]::Round([double]$res[$method].brierSum / $n,4)
        }
        if ($n -lt 3) { continue }
        if ([double]$res[$method].brier -lt $bestError) {
            $bestError=[double]$res[$method].brier; $best=$method
        }
    }
    return @{byMethod=$res;bestMethod=$best
        evaluated=$(if ($best) {[Math]::Round($bestError,4)} else {$null})
        metric='Brier score: lower is better'
        note='Сравнение возможно только после трёх подтверждённых исходов. Не доказывает качество всех типов ответов или причинность.'}
}
function Invoke-YE5DetectGaps {
    if (-not $script:YE5.enabled) { return 0 }
    $new=0
    # Existing owner-facing gaps never become factual conclusions.
    foreach ($g in @(Get-YUndGaps | Where-Object { -not $_.dismissed } | Select-Object -First 3)) {
        $q='Не хватает данных: ' + [string]$g.name
        if (-not (Test-YTopicVisible $q)) { continue }
        $before=$script:YE5.gaps.Count
        [void](Add-YE5Gap $q 'research' 'und-gap')
        if ($script:YE5.gaps.Count -gt $before) { $new++ }
    }
    foreach ($c in @(Get-YVectorConflicts | Select-Object -First 3)) {
        $q='Уточнить противоречие: ' + [string]$c.key
        if (-not (Test-YTopicVisible $q)) { continue }
        $before=$script:YE5.gaps.Count
        [void](Add-YE5Gap $q 'reasoning' 'memory-conflict')
        if ($script:YE5.gaps.Count -gt $before) { $new++ }
    }
    return $new
}
function Invoke-YE5SelectGoal {
    if (-not $script:YE5.enabled) { return $null }
    if (@($script:YE5.goals | Where-Object { @('active','proposed') -contains $_.status }).Count -ge 5) { return $null }
    foreach ($gap in @($script:YE5.gaps | Where-Object { $_.status -eq 'open' } | Select-Object -First 8)) {
        $related=@($script:YE5.goals | Where-Object { $_.title -eq $gap.question -and $_.status -ne 'cancelled' })
        if ($related.Count) { continue }
        return Add-YE5Goal @{ title=[string]$gap.question; domain=[string]$gap.domain; impact=3; urgency=2; effort=2 }
    }
    return $null
}
function Invoke-YE5Cycle([bool]$Force = $false) {
    if (-not $script:YE5.enabled) { return @{ ran=$false; reason='disabled' } }
    $now=Get-YNow
    if (-not $Force -and $now - [long]$script:YE5.lastCycle -lt 86400000L) { return @{ran=$false;reason='daily-limit'} }
    $found=Invoke-YE5DetectGaps
    $suggested=Invoke-YE5SelectGoal
    $risk=Get-YE5Regression
    $focus=@(Get-YE5RankedGoals | Where-Object { $_.status -eq 'active' } | Select-Object -First 1)
    $next=$(if ($focus.Count) { 'Приоритет: '+[string]$focus[0].title+'. '+[string]$focus[0].next } else { 'Нет одобренных учебных целей; предложения ждут хозяина.' })
    Add-YE5Log 'cycle' ($next+' Новых пробелов: '+$found+'.')
    $script:YE5.lastCycle=$now
    Save-YE5
    return @{ ran=$true; discovered=$found; suggestedGoal=$(if ($null -eq $suggested){''}else{[string]$suggested.id})
        next=$next; regression=$risk; usedCloud=$false }
}
