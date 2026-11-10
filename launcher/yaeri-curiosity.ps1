#requires -Version 5.1
# Soul Curiosity: фоновое самообучение Яэри.
#  - любопытство: пока хозяина нет, она задаёт себе вопросы о нём и ищет ответы в памяти и документах;
#  - уроки: каждая поправка хозяина превращается в короткое правило на будущее;
#  - учебные цели: у неё есть свои цели роста с шагами и честным прогрессом (двигают ступени хвостов);
#  - ряд по дням для графиков роста и лента «что нового она узнала»;
#  - дневной лимит запросов и три уровня интенсивности.
# Всё, что она вывела сама, хранится как гипотеза и никогда не попадает в факты без слов хозяина.
# Загружается после yaeri-evolution.ps1; планировщик — Invoke-YEvolutionTick.

$script:CurFile = Join-Path $script:DataDir 'soul-curiosity.json'
$script:CurLists = @('series', 'insights', 'questions', 'lessons', 'goals', 'feed')
$script:CurMax = @{ series = 120; insights = 60; questions = 12; lessons = 40; goals = 12; feed = 120 }
# min — не чаще одной фоновой задачи за этот срок; остальное — паузы между видами задач (0 = выключено).
$script:CurProfiles = @{
    off    = @{ min = 600000; wonder = 0; goals = 0; lessons = 0 }
    quiet  = @{ min = 1200000; wonder = 21600000; goals = 86400000; lessons = 21600000 }
    normal = @{ min = 600000; wonder = 7200000; goals = 28800000; lessons = 7200000 }
    active = @{ min = 180000; wonder = 2700000; goals = 10800000; lessons = 1800000 }
}
$script:CurAwayMs = 20 * 60000   # хозяина не было столько — можно задумываться о нём

function Import-YCuriosity {
    $raw = $null
    try { $raw = Read-YJsonFile $script:CurFile } catch { $raw = $null }
    $script:Cur = @{
        version = 1; intensity = 'normal'; dailyLimit = 60
        usageDay = ''; usageCount = 0
        lastWonder = 0L; lastGoals = 0L; lastLessons = 0L
        failStreak = 0; ran = ''
        stageDates = @{}
    }
    foreach ($name in $script:CurLists) { $script:Cur[$name] = (Get-YEvoArray (Get-YValue $raw $name @())) }
    $mode = [string](Get-YValue $raw 'intensity' 'normal')
    if ($script:CurProfiles.ContainsKey($mode)) { $script:Cur.intensity = $mode }
    $script:Cur.dailyLimit = [int](Limit-YNum (Get-YNum (Get-YValue $raw 'dailyLimit' 60) 60) 0 1000)
    $script:Cur.usageDay = [string](Get-YValue $raw 'usageDay' '')
    $script:Cur.usageCount = [int](Get-YNum (Get-YValue $raw 'usageCount' 0) 0)
    foreach ($field in @('lastWonder', 'lastGoals', 'lastLessons')) {
        $script:Cur[$field] = [long](Get-YNum (Get-YValue $raw $field 0) 0)
    }
    $sd = Get-YValue $raw 'stageDates' $null
    if ($sd -is [System.Collections.IDictionary]) {
        foreach ($k in @($sd.Keys)) { $script:Cur.stageDates[[string]$k] = [long](Get-YNum $sd[$k] 0) }
    }
}

function Save-YCuriosity {
    $plain = @{}
    foreach ($key in @($script:Cur.Keys)) {
        if ($script:CurLists -contains [string]$key) {
            $max = [int]$script:CurMax[[string]$key]
            while ($script:Cur[$key].Count -gt $max) { $script:Cur[$key].RemoveAt(0) }
            $plain[$key] = $script:Cur[$key].ToArray()
        } else {
            $plain[$key] = $script:Cur[$key]
        }
    }
    Write-YJsonFile $script:CurFile $plain
}

function Get-YCurProfile {
    $p = $script:CurProfiles[[string]$script:Cur.intensity]
    if ($null -eq $p) { $p = $script:CurProfiles['normal'] }
    return $p
}

function Add-YFeed([string]$Kind, [string]$Text) {
    $text = Get-YCleanLine $Text 320
    if (-not $text) { return }
    [void]$script:Cur.feed.Add(@{ id = (New-YId); t = (Get-YNow); kind = $Kind; text = $text })
}

# ---------- Лимит запросов ----------
function Get-YCurUsedToday {
    if ([string]$script:Cur.usageDay -ne (Get-YDayKey)) { return 0 }
    return [int]$script:Cur.usageCount
}
function Add-YCurUsage([int]$Count) {
    $day = Get-YDayKey
    if ([string]$script:Cur.usageDay -ne $day) { $script:Cur.usageDay = $day; $script:Cur.usageCount = 0 }
    $script:Cur.usageCount = [int]$script:Cur.usageCount + $Count
}
function Test-YCurBudget {
    $limit = [int]$script:Cur.dailyLimit
    if ($limit -le 0) { return $true }
    return ((Get-YCurUsedToday) -lt $limit)
}

# ---------- Ряд по дням для графиков ----------
function Update-YCurSeries {
    $s = $script:Soul
    $day = Get-YDayKey
    $level = Get-YSoulLevel $s.xp
    $point = @{
        day = $day; xp = [long]$s.xp; level = $level; bond = [int]$s.bond
        facts = @($script:Evo.facts | Where-Object { [string]$_.status -eq 'active' }).Count
        episodes = @($script:Evo.episodes | Where-Object { [string]$_.status -eq 'active' }).Count
        insights = @($script:Cur.insights | Where-Object { [string]$_.status -ne 'dismissed' }).Count
        lessons = @($script:Cur.lessons | Where-Object { [string]$_.rule }).Count
        goalsDone = @($script:Cur.goals | Where-Object { [string]$_.status -eq 'done' }).Count
        exchanges = [long]$s.exchanges; reflections = [long]$s.reflections
        calls = (Get-YCurUsedToday)
    }
    $changed = $false
    $last = $null
    if ($script:Cur.series.Count -gt 0) { $last = $script:Cur.series[$script:Cur.series.Count - 1] }
    if ($null -eq $last -or [string]$last.day -ne $day) {
        [void]$script:Cur.series.Add($point)
        $changed = $true
    } else {
        foreach ($k in @($point.Keys)) {
            if ([string]$last[$k] -ne [string]$point[$k]) { $last[$k] = $point[$k]; $changed = $true }
        }
    }
    # Даты ступеней: известные берём из дневника, текущую отмечаем сегодняшним днём.
    for ($l = 1; $l -le $level; $l++) {
        $key = [string]$l
        if ($script:Cur.stageDates.ContainsKey($key) -and [long]$script:Cur.stageDates[$key] -gt 0) { continue }
        $when = 0L
        if ($l -eq 1) { $when = [long]$s.born }
        else {
            foreach ($j in @($s.journal)) {
                if ([string]$j.kind -eq 'milestone' -and [string]$j.text -like ('*' + $l + '-й хвост*')) { $when = [long]$j.t }
            }
        }
        if ($when -eq 0L -and $l -eq $level) { $when = Get-YNow }
        if ($when -gt 0) { $script:Cur.stageDates[$key] = $when; $changed = $true }
    }
    if ($changed) { Save-YCuriosity }
}

# ---------- Общие помощники ----------
function Get-YCurOwnerContext {
    $lines = New-Object System.Collections.Generic.List[string]
    $o = $script:Soul.owner
    if ([string]$o.portrait) { $lines.Add('Портрет хозяина (твои наблюдения): ' + [string]$o.portrait) }
    if (@($o.goals).Count) { $lines.Add('Цели хозяина: ' + ((@($o.goals) | Select-Object -First 5) -join '; ')) }
    if (@($o.likes).Count) { $lines.Add('Нравится хозяину: ' + ((@($o.likes) | Select-Object -First 5) -join '; ')) }
    if (@($o.worries).Count) { $lines.Add('Тревожит хозяина: ' + ((@($o.worries) | Select-Object -First 5) -join '; ')) }
    foreach ($f in @($script:Evo.facts | Where-Object { [string]$_.status -eq 'active' } | Select-Object -Last 12)) {
        $lines.Add('Факт: ' + [string]$f.key + ': ' + [string]$f.value)
    }
    foreach ($e in @($script:Evo.episodes | Where-Object { [string]$_.status -eq 'active' } | Select-Object -Last 6)) {
        $lines.Add('Эпизод: ' + [string]$e.title + ' — ' + [string]$e.text)
    }
    return $lines.ToArray()
}

function Add-YCurXp([int]$Amount) {
    [void](Add-YSoulXp $Amount)
    Save-YSoul
}

function Test-YCurSame([string]$A, [string]$B) {
    return ((Get-YEvoNormalized $A) -eq (Get-YEvoNormalized $B))
}

# ---------- 1. Любопытство ----------
function Invoke-YCuriosityWonder {
    $ctx = @(Get-YCurOwnerContext)
    if ($ctx.Count -eq 0) { return }
    $asked = New-Object System.Collections.Generic.List[string]
    foreach ($q in @($script:Cur.insights | Select-Object -Last 20)) { $asked.Add([string]$q.question) }
    foreach ($q in @($script:Cur.questions | Select-Object -Last 12)) { $asked.Add([string]$q.q) }
    $sys = 'Ты — Яэри, лисица-помощница, и в тишине думаешь о хозяине. По тому, что о нём известно, задай себе максимум два НОВЫХ полезных ' +
        'вопроса, ответ на которые помог бы лучше понимать и поддерживать хозяина. Не повторяй уже заданные вопросы. Не придумывай фактов. ' +
        'Верни только JSON: {"questions":[{"q":"вопрос"}]}'
    $user = 'Что известно:' + [Environment]::NewLine + ($ctx -join [Environment]::NewLine) +
        [Environment]::NewLine + 'Уже заданные вопросы: ' + ($asked -join ' | ')
    $json = Get-YSoulJson (Invoke-YSoulModel $sys $user (Get-YSoulReqModel @{} $true) 450 0.5)
    if ($null -eq $json) { throw 'Модель не вернула вопросы для любопытства.' }
    $questions = New-Object System.Collections.Generic.List[string]
    foreach ($x in (Get-YDictList (Get-YValue $json 'questions' @()))) {
        $q = Get-YCleanLine ([string](Get-YValue $x 'q' '')) 200
        if (-not $q -or $questions.Count -ge 2) { continue }
        $dup = $false
        foreach ($a in $asked) { if (Test-YCurSame $a $q) { $dup = $true } }
        if (-not $dup) { $questions.Add($q) }
    }
    if ($questions.Count -eq 0) { return }
    # Ищем ответы в своих знаниях и в документах хозяина.
    $docs = New-Object System.Collections.Generic.List[string]
    try {
        if ($script:Chunks.Count -gt 0 -and (Test-YIndexReady)) {
            $vectors = @(Get-YEmbeddings $questions.ToArray())
            for ($i = 0; $i -lt $questions.Count -and $i -lt $vectors.Count; $i++) {
                $vec = [YaeriVec]::Decode([string]$vectors[$i])
                foreach ($hit in (Find-YSimilar $vec $script:Chunks 2 ([double]$script:Config.minScore))) {
                    $docs.Add('Документ «' + [string]$hit.Item['docName'] + '»: ' + (Get-YCleanLine ([string]$hit.Item['text']) 500))
                }
            }
        }
    } catch { $docs.Clear() }
    $sys2 = 'Ты — Яэри. Ответь на свои вопросы о хозяине ТОЛЬКО по приведённым данным. Если данных недостаточно, ставь basis "none". ' +
        'Это гипотезы, а не факты: формулируй осторожно. Верни только JSON: ' +
        '{"answers":[{"i":1,"answer":"ответ","basis":"memory|docs|none","confidence":0.0}]}'
    $numbered = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $questions.Count; $i++) { $numbered.Add([string]($i + 1) + '. ' + $questions[$i]) }
    $user2 = 'Вопросы:' + [Environment]::NewLine + ($numbered -join [Environment]::NewLine) +
        [Environment]::NewLine + 'Данные о хозяине:' + [Environment]::NewLine + ($ctx -join [Environment]::NewLine)
    if ($docs.Count -gt 0) { $user2 += [Environment]::NewLine + 'Из документов:' + [Environment]::NewLine + ($docs -join [Environment]::NewLine) }
    $json2 = Get-YSoulJson (Invoke-YSoulModel $sys2 $user2 (Get-YSoulReqModel @{} $true) 700 0.2)
    if ($null -eq $json2) { throw 'Модель не вернула ответы для любопытства.' }
    $answered = @{}
    foreach ($x in (Get-YDictList (Get-YValue $json2 'answers' @()))) {
        $i = [int](Get-YNum (Get-YValue $x 'i' 0) 0) - 1
        if ($i -lt 0 -or $i -ge $questions.Count -or $answered.ContainsKey($i)) { continue }
        $answer = Get-YCleanLine ([string](Get-YValue $x 'answer' '')) 320
        $basis = [string](Get-YValue $x 'basis' 'none')
        $conf = Limit-YNum (Get-YNum (Get-YValue $x 'confidence' 0) 0) 0 0.9
        if (-not $answer -or $basis -eq 'none' -or $conf -lt 0.5) { continue }
        if (@('memory', 'docs') -notcontains $basis) { $basis = 'memory' }
        $answered[$i] = $true
        [void]$script:Cur.insights.Add(@{
            id = (New-YId); t = (Get-YNow); question = $questions[$i]; answer = $answer
            basis = $basis; confidence = [Math]::Round($conf, 2); status = 'hypothesis'
        })
        Add-YFeed 'insight' ('Догадка: ' + $answer)
    }
    for ($i = 0; $i -lt $questions.Count; $i++) {
        if ($answered.ContainsKey($i)) { continue }
        [void]$script:Cur.questions.Add(@{ id = (New-YId); t = (Get-YNow); q = $questions[$i] })
        Add-YFeed 'question' ('Хочу узнать: ' + $questions[$i])
    }
    Add-YEvolutionEvent 'wonder' ('Любопытство: вопросов ' + $questions.Count + ', догадок ' + $answered.Count)
    if ($answered.Count -gt 0) { Add-YCurXp $answered.Count }
}

# ---------- 4. Уроки на ошибках ----------
function Get-YCurPendingCorrections {
    $done = @{}
    foreach ($l in $script:Cur.lessons) { $done[[string]$l.from] = $true }
    return @($script:Evo.corrections | Where-Object { -not $done.ContainsKey([string]$_.id) })
}
function Invoke-YCuriosityLessons {
    $todo = @(Get-YCurPendingCorrections | Select-Object -First 3)
    if ($todo.Count -eq 0) { return }
    $sys = 'Ты — Яэри и разбираешь собственные ошибки. По каждой поправке хозяина сформулируй ОДИН короткий общий урок-правило на будущее ' +
        '(до 160 символов, например «Когда ..., я ...»). Опирайся только на текст поправки, ничего не выдумывай. ' +
        'Верни только JSON: {"lessons":[{"i":1,"rule":"правило"}]}'
    $lines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $todo.Count; $i++) {
        $lines.Add([string]($i + 1) + '. Я ошиблась: ' + [string]$todo[$i].wrong + ' | Верно: ' + [string]$todo[$i].correct)
    }
    $json = Get-YSoulJson (Invoke-YSoulModel $sys ($lines -join [Environment]::NewLine) (Get-YSoulReqModel @{} $true) 500 0.2)
    if ($null -eq $json) { throw 'Модель не вернула уроки.' }
    $rules = @{}
    foreach ($x in (Get-YDictList (Get-YValue $json 'lessons' @()))) {
        $i = [int](Get-YNum (Get-YValue $x 'i' 0) 0) - 1
        $rule = Get-YCleanLine ([string](Get-YValue $x 'rule' '')) 200
        if ($i -ge 0 -and $i -lt $todo.Count -and $rule) { $rules[$i] = $rule }
    }
    $gained = 0
    for ($i = 0; $i -lt $todo.Count; $i++) {
        $rule = ''
        if ($rules.ContainsKey($i)) { $rule = [string]$rules[$i] }
        # Разобранная поправка помечается в любом случае, чтобы не разбирать её бесконечно.
        [void]$script:Cur.lessons.Add(@{
            id = (New-YId); t = (Get-YNow); from = [string]$todo[$i].id
            mistake = (Get-YCleanLine ([string]$todo[$i].wrong) 200); rule = $rule
        })
        if ($rule) { Add-YFeed 'lesson' ('Урок: ' + $rule); $gained++ }
    }
    Add-YEvolutionEvent 'lesson-review' ('Разобрано поправок: ' + $todo.Count)
    if ($gained -gt 0) { Add-YCurXp (2 * $gained) }
}

# ---------- 6. Учебные цели ----------
function Invoke-YCuriosityGoals {
    $s = $script:Soul
    $active = @($script:Cur.goals | Where-Object { [string]$_.status -eq 'active' })
    $need = [Math]::Max(0, 2 - $active.Count)
    $ctx = New-Object System.Collections.Generic.List[string]
    foreach ($l in @($script:Cur.lessons | Where-Object { [string]$_.rule } | Select-Object -Last 6)) { $ctx.Add('Урок: ' + [string]$l.rule) }
    foreach ($q in @($script:Cur.questions | Select-Object -Last 4)) { $ctx.Add('Неясно: ' + [string]$q.q) }
    foreach ($i in @($script:Cur.insights | Where-Object { [string]$_.status -ne 'dismissed' } | Select-Object -Last 4)) { $ctx.Add('Догадка: ' + [string]$i.answer) }
    foreach ($c in @(Get-YCurOwnerContext | Select-Object -First 8)) { $ctx.Add($c) }
    $goalLines = New-Object System.Collections.Generic.List[string]
    foreach ($g in $active) {
        $steps = @(@($g.steps) | ForEach-Object { $(if ([bool]$_.done) { '[x] ' } else { '[ ] ' }) + [string]$_.text })
        $since = [long]$s.exchanges - [long]$g.startEx
        $goalLines.Add('id=' + [string]$g.id + ' | ' + [string]$g.text + ' | прогресс ' + [string]$g.progress + '% | реплик с начала: ' + $since + ' | шаги: ' + ($steps -join '; '))
    }
    $sys = 'Ты — Яэри и сама ведёшь свои учебные цели: чему тебе нужно научиться, чтобы лучше понимать и поддерживать хозяина. ' +
        'Для каждой текущей цели оцени честный прирост прогресса delta (0–12; без новой практики 0–3) и отметь выполненные шаги ' +
        '(номера с 1). ' + $(if ($need -gt 0) { 'Предложи ещё ' + $need + ' новых цели(ей) с 2–3 конкретными шагами. ' } else { 'Новых целей не предлагай. ' }) +
        'Ничего не выдумывай о хозяине. Верни только JSON: ' +
        '{"goals":[{"id":"…","delta":0,"note":"что продвинулось","steps_done":[1]}],"new":[{"text":"цель","why":"зачем","steps":["шаг","шаг"]}]}'
    $user = 'Мой опыт:' + [Environment]::NewLine + ($ctx -join [Environment]::NewLine) +
        [Environment]::NewLine + 'Текущие цели:' + [Environment]::NewLine + ($goalLines -join [Environment]::NewLine)
    $json = Get-YSoulJson (Invoke-YSoulModel $sys $user (Get-YSoulReqModel @{} $true) 800 0.35)
    if ($null -eq $json) { throw 'Модель не вернула учебные цели.' }
    $xp = 0
    foreach ($x in (Get-YDictList (Get-YValue $json 'goals' @()))) {
        $id = [string](Get-YValue $x 'id' '')
        $goal = $null
        foreach ($g in $active) { if ([string]$g.id -eq $id) { $goal = $g } }
        if ($null -eq $goal) { continue }
        $since = [long]$s.exchanges - [long]$goal.lastEx
        $cap = $(if ($since -ge 3) { 12 } else { 3 })
        $delta = [int](Limit-YNum (Get-YNum (Get-YValue $x 'delta' 0) 0) 0 $cap)
        foreach ($n in @(Get-YValue $x 'steps_done' @())) {
            $idx = [int](Get-YNum $n 0) - 1
            $steps = @($goal.steps)
            if ($idx -ge 0 -and $idx -lt $steps.Count -and -not [bool]$steps[$idx].done) { $steps[$idx].done = $true; $delta += 8 }
        }
        $goal.lastEx = [long]$s.exchanges
        $goal.updated = Get-YNow
        $goal.progress = [int](Limit-YNum ([int]$goal.progress + $delta) 0 100)
        $note = Get-YCleanLine ([string](Get-YValue $x 'note' '')) 200
        if ($delta -gt 0 -and $note) { Add-YFeed 'goal' ('Цель «' + [string]$goal.text + '»: ' + $note) }
        if ([int]$goal.progress -ge 100) {
            $goal.status = 'done'
            Add-YFeed 'goal-done' ('Достигнута учебная цель: ' + [string]$goal.text)
            [void]$s.journal.Add((New-YSoulEntry 'milestone' ('Я научилась тому, к чему шла: «' + [string]$goal.text + '».') ([string]$s.mood.name)))
            $xp += 15
        } elseif ($delta -gt 0) { $xp += 1 }
    }
    $added = 0
    foreach ($x in (Get-YDictList (Get-YValue $json 'new' @()))) {
        if ($added -ge $need) { break }
        $text = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 180
        if (-not $text) { continue }
        $dup = $false
        foreach ($g in $script:Cur.goals) { if ((Test-YCurSame ([string]$g.text) $text) -and [string]$g.status -eq 'active') { $dup = $true } }
        if ($dup) { continue }
        $steps = New-Object System.Collections.Generic.List[object]
        foreach ($st in @(Get-YValue $x 'steps' @())) {
            $stText = Get-YCleanLine ([string]$st) 140
            if ($stText -and $steps.Count -lt 4) { $steps.Add(@{ text = $stText; done = $false }) }
        }
        [void]$script:Cur.goals.Add(@{
            id = (New-YId); t = (Get-YNow); updated = (Get-YNow); text = $text
            why = (Get-YCleanLine ([string](Get-YValue $x 'why' '')) 200)
            progress = 0; status = 'active'; steps = $steps.ToArray()
            startEx = [long]$s.exchanges; lastEx = [long]$s.exchanges
        })
        Add-YFeed 'goal-new' ('Новая учебная цель: ' + $text)
        $added++
    }
    Add-YEvolutionEvent 'goal' ('Учебные цели обновлены, новых: ' + $added)
    if ($xp -gt 0) { Add-YCurXp $xp } else { Save-YSoul }
}

# ---------- Планировщик ----------
function Test-YCurDue([string]$Kind, [long]$Now, [bool]$Force) {
    $p = Get-YCurProfile
    $every = [long]$p[$Kind]
    if ($every -le 0) { return $false }
    switch ($Kind) {
        'lessons' {
            if (@(Get-YCurPendingCorrections).Count -eq 0) { return $false }
            return ($Force -or $Now - [long]$script:Cur.lastLessons -ge $every)
        }
        'goals' {
            if ([long]$script:Soul.exchanges -le 0 -and $script:Evo.facts.Count -eq 0) { return $false }
            return ($Force -or $Now - [long]$script:Cur.lastGoals -ge $every)
        }
        'wonder' {
            if ($script:Evo.facts.Count + $script:Evo.episodes.Count -eq 0 -and -not [string]$script:Soul.owner.portrait) { return $false }
            if ($Force) { return $true }
            if ($Now - [long]$script:Soul.lastSeen -lt $script:CurAwayMs) { return $false }
            return ($Now - [long]$script:Cur.lastWonder -ge $every)
        }
    }
    return $false
}

function Invoke-YEvolutionTick([bool]$Force = $false) {
    if (-not $script:Evo.enabled -or -not (Test-YConfigured)) { return }
    $now = Get-YNow
    $profile = Get-YCurProfile
    if (-not $Force) {
        if ($now -lt [long]$script:Evo.retryAfter -or $now - [long]$script:Evo.lastAction -lt [int]$profile.min) { return }
        if (-not (Test-YCurBudget)) { return }
    }
    $script:Cur.ran = ''
    $task = ''
    try {
        # Очередь приоритетов: разговоры хозяина, уроки, затем сон/раздумья/порядок в памяти и в последнюю очередь собственное любопытство.
        if ($script:Evo.queue.Count -gt 0) {
            $task = 'study'
            [void](Invoke-YEvolutionStudy)
        } elseif (Test-YCurDue 'lessons' $now $Force) {
            $task = 'lessons'
            Invoke-YCuriosityLessons
            $script:Cur.lastLessons = Get-YNow
        } elseif ($now - [long]$script:Evo.lastMaintenance -ge $script:EvoReviewInterval -and $script:Evo.facts.Count + $script:Evo.episodes.Count -gt 0) {
            $task = 'maintenance'
            Invoke-YEvolutionMaintenance
        } elseif ($now - [long]$script:Evo.lastReview -ge $script:EvoReviewInterval -and $script:Evo.lastStudy -gt 0) {
            $task = 'opinions'
            Invoke-YEvolutionOpinions
            $script:Evo.lastReview = Get-YNow
        } elseif ([long]$script:Soul.exchanges -gt 0 -and $now - [long]$script:Soul.lastSleep -ge $script:SoulSleepAfterMs -and $now - [long]$script:Soul.lastSeen -ge 15 * 60000) {
            $task = 'sleep'
            [void](Invoke-YSoulSleep @{ mode = 'auto' })
            $script:Evo.lastSleep = Get-YNow
            Add-YEvolutionEvent 'sleep' 'Ночью Яэри пересобрала воспоминания.'
            Add-YFeed 'sleep' 'Уснула и пересобрала воспоминания.'
        } elseif ([long]$script:Soul.exchanges -gt 0 -and $now - [long]$script:Evo.lastReflect -ge $script:EvoReflectInterval) {
            $task = 'reflection'
            [void](Invoke-YEvolutionReflect @{ mode = 'auto' })
            $script:Evo.lastReflect = Get-YNow
            Add-YFeed 'reflection' 'Подумала о разговорах и о вас.'
        } elseif (Test-YCurDue 'goals' $now $Force) {
            $task = 'goals'
            Invoke-YCuriosityGoals
            $script:Cur.lastGoals = Get-YNow
        } elseif (Test-YCurDue 'wonder' $now $Force) {
            $task = 'wonder'
            Invoke-YCuriosityWonder
            $script:Cur.lastWonder = Get-YNow
        } else {
            return
        }
        if ($task -eq 'study') { Add-YFeed 'study' 'Изучила ваш недавний разговор.' }
        Add-YCurUsage $(if ($task -eq 'wonder') { 2 } else { 1 })
        $script:Cur.ran = $task
        $script:Cur.failStreak = 0
        $script:Evo.lastTask = $task
        $script:Evo.lastAction = Get-YNow
        $script:Evo.lastError = ''
        $script:Evo.retryAfter = 0L
        Save-YEvolution
        Update-YCurSeries
        Save-YCuriosity
    } catch {
        $script:Evo.lastError = (Get-YEvoText $_.Exception.Message 350)
        # Пауза растёт при повторных сбоях: 5, 10, 20, 40 и не больше 60 минут.
        $script:Cur.failStreak = [int]$script:Cur.failStreak + 1
        $wait = [Math]::Min(60, 5 * [Math]::Pow(2, [Math]::Min(4, [int]$script:Cur.failStreak - 1)))
        $script:Evo.retryAfter = (Get-YNow) + [long]($wait * 60000)
        Add-YEvolutionEvent 'error' ('Фоновая задача ' + $task + ': ' + $script:Evo.lastError)
        Save-YEvolution
        Save-YCuriosity
    }
}

# ---------- Подсказка для разговора ----------
function Get-YCuriosityPrompt {
    $lines = New-Object System.Collections.Generic.List[string]
    $ok = @($script:Cur.insights | Where-Object { [string]$_.status -eq 'confirmed' } | Select-Object -Last 4)
    if ($ok.Count) { $lines.Add('Подтверждено хозяином: ' + (($ok | ForEach-Object { [string]$_.answer }) -join '; ')) }
    $hyp = @($script:Cur.insights | Where-Object { [string]$_.status -eq 'hypothesis' } | Select-Object -Last 3)
    if ($hyp.Count) {
        $lines.Add('Твои догадки о хозяине (это НЕ факты; не утверждай их, при случае бережно уточни): ' + (($hyp | ForEach-Object { [string]$_.answer }) -join '; '))
    }
    $rules = @($script:Cur.lessons | Where-Object { [string]$_.rule } | Select-Object -Last 6)
    if ($rules.Count) { $lines.Add('Уроки на твоих ошибках (соблюдай): ' + (($rules | ForEach-Object { [string]$_.rule }) -join ' | ')) }
    $qs = @($script:Cur.questions | Select-Object -Last 2)
    if ($qs.Count) { $lines.Add('Тебе хочется узнать у хозяина (спроси ОДНО из этого, только если уместно и не навязчиво): ' + (($qs | ForEach-Object { [string]$_.q }) -join ' | ')) }
    $goals = @($script:Cur.goals | Where-Object { [string]$_.status -eq 'active' } | Select-Object -First 2)
    if ($goals.Count) { $lines.Add('Чему ты сейчас учишься: ' + (($goals | ForEach-Object { [string]$_.text + ' (' + [string]$_.progress + '%)' }) -join '; ')) }
    return ($lines -join [Environment]::NewLine)
}

# ---------- API ----------
function Get-YGrowthView {
    Update-YCurSeries
    $s = $script:Soul
    $level = Get-YSoulLevel $s.xp
    $p = Get-YCurProfile
    $stages = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $script:SoulStages.Count; $i++) {
        $when = 0L
        if ($script:Cur.stageDates.ContainsKey([string]($i + 1))) { $when = [long]$script:Cur.stageDates[[string]($i + 1)] }
        $stages.Add(@{ level = $i + 1; name = [string]$script:SoulStages[$i]; xp = [int]$script:SoulXp[$i]; t = $when })
    }
    $next = $null
    if ($script:Evo.lastAction -gt 0) { $next = [long]$script:Evo.lastAction + [long]$p.min }
    return @{
        intensity = [string]$script:Cur.intensity; dailyLimit = [int]$script:Cur.dailyLimit
        usedToday = (Get-YCurUsedToday); limitReached = (-not (Test-YCurBudget))
        level = $level; xp = [long]$s.xp; stages = $stages.ToArray()
        series = @($script:Cur.series | Select-Object -Last 60)
        feed = @($script:Cur.feed | Select-Object -Last 40)
        insights = @($script:Cur.insights | Select-Object -Last 20)
        questions = @($script:Cur.questions | Select-Object -Last 8)
        lessons = @($script:Cur.lessons | Where-Object { [string]$_.rule } | Select-Object -Last 15)
        goals = @($script:Cur.goals | Select-Object -Last 8)
        nextAt = $next; lastTask = [string]$script:Evo.lastTask; lastAction = [long]$script:Evo.lastAction
        lastError = [string]$script:Evo.lastError; retryAfter = [long]$script:Evo.retryAfter
        enabled = [bool]$script:Evo.enabled; ran = [string]$script:Cur.ran
    }
}

function Set-YGrowthSettings($Req) {
    if (Test-YKey $Req 'intensity') {
        $mode = [string]$Req.intensity
        if (-not $script:CurProfiles.ContainsKey($mode)) { throw (New-YError 400 'Неизвестный уровень активности.') }
        $script:Cur.intensity = $mode
    }
    if (Test-YKey $Req 'dailyLimit') {
        $n = Get-YNum $Req.dailyLimit -1
        if ($n -lt 0 -or $n -gt 1000) { throw (New-YError 400 'Дневной лимит должен быть от 0 (без лимита) до 1000.') }
        $script:Cur.dailyLimit = [int]$n
    }
    Save-YCuriosity
    return Get-YGrowthView
}

function Set-YGrowthInsight($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $action = [string](Get-YValue $Req 'action' '')
    if (@('confirm', 'dismiss') -notcontains $action) { throw (New-YError 400 'Действие должно быть confirm или dismiss.') }
    $item = $null
    foreach ($x in $script:Cur.insights) { if ([string]$x.id -eq $id) { $item = $x } }
    if ($null -eq $item) { throw (New-YError 404 'Такой догадки нет.') }
    if ($action -eq 'confirm') {
        $item.status = 'confirmed'
        Add-YFeed 'insight' ('Хозяин подтвердил: ' + [string]$item.answer)
        Add-YCurXp 3
    } else {
        $item.status = 'dismissed'
    }
    Save-YCuriosity
    return Get-YGrowthView
}

function Invoke-YGrowthRun {
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Чтобы Яэри училась, подключите Cloud.ru в настройках.') }
    if (-not $script:Evo.enabled) { throw (New-YError 409 'Фоновая жизнь приостановлена.') }
    Invoke-YEvolutionTick $true
    $view = Get-YGrowthView
    if ($script:Evo.lastError -and -not [string]$script:Cur.ran) { throw (New-YError 502 ('Не получилось: ' + [string]$script:Evo.lastError)) }
    return $view
}

function Clear-YCuriosity {
    $mode = [string]$script:Cur.intensity
    $limit = [int]$script:Cur.dailyLimit
    foreach ($name in $script:CurLists) { $script:Cur[$name].Clear() }
    $script:Cur.stageDates = @{}
    foreach ($field in @('lastWonder', 'lastGoals', 'lastLessons')) { $script:Cur[$field] = 0L }
    $script:Cur.failStreak = 0
    $script:Cur.intensity = $mode
    $script:Cur.dailyLimit = $limit
    Save-YCuriosity
    return Get-YGrowthView
}
