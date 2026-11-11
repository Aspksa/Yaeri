#requires -Version 5.1
# Soul Depth: глубина души Яэри.
#  - предчувствие: по ритму хозяина (ночные сессии, тон, длина, повторы) замечает выгорание или застревание и мягко вмешивается;
#  - симуляция будущего: перед советом прогоняет 2–3 варианта развития и показывает, чем каждый, вероятно, кончится;
#  - собственный характер: свои вкусы, привычки и причуды, которые растут сами, отдельно от вкусов хозяина;
#  - личная философия: со временем формулирует свои принципы и помнит, откуда каждый взялся;
#  - самописные навыки: сама пишет себе сценарии; работают только после одобрения хозяина, проверяются в песочнице;
#  - самоулучшение: в фоне оценивает свои ответы и предлагает правки души, которые применяются только после одобрения.
# Фоновые задачи идут через общий планировщик (Invoke-YEvolutionTick), только когда хозяина нет рядом,
# с «умной» моделью Cloud.ru и в пределах общего дневного лимита запросов. Данные: data\soul-depth.json.
# Загружается после yaeri-curiosity.ps1 и yaeri-understanding.ps1.

$script:DepLists = @('simulations', 'skills', 'traitsOwn', 'charLog', 'principles', 'evals', 'proposals', 'rules')
$script:DepMax = @{ simulations = 30; skills = 30; traitsOwn = 30; charLog = 60; principles = 9; evals = 160; proposals = 40; rules = 12 }
$script:DepKindMax = @{ taste = 12; habit = 8; quirk = 8 }
$script:DepFlags = @('foresight', 'rhythm', 'character', 'philosophy', 'skills', 'review')
# Паузы между фоновыми задачами глубины для каждого уровня активности (0 = выключено).
$script:DepProfiles = @{
    off    = @{ review = 0; character = 0; principles = 0; skills = 0 }
    quiet  = @{ review = 86400000; character = 172800000; principles = 259200000; skills = 259200000 }
    normal = @{ review = 28800000; character = 86400000; principles = 129600000; skills = 129600000 }
    active = @{ review = 10800000; character = 28800000; principles = 43200000; skills = 43200000 }
}
$script:DepNudgeRepeatMs = 48 * 3600000   # одно и то же предчувствие — не чаще раза в двое суток
$script:DepRhythmEveryMs = 10 * 60000      # пересчёт ритма не чаще раза в 10 минут
$script:DepAdviceRx = '(?i)(посоветуй|подскажи,? (как|что)|нужен совет|твой совет|что (же )?(мне )?делать|как (мне )?быть|стоит ли|как лучше|что лучше|что выбрать|выбрать между|принять решение|решиться|соглашаться ли|уходить ли|переезжать ли|бросить ли|\bили\b[^?]{0,120}\?)'
$script:DepStruggleRx = '(?i)(не получается|не выходит|опять|снова|застрял|застряла|не понимаю|не могу|ошибк|не работает|бьюсь|туплю|не двигается|ничего не помогает|топчусь)'
# Навыки — только текст для самой Яэри. Всё, что похоже на попытку обойти правила или выйти из песочницы, отбрасывается.
$script:DepSkillDenyRx = '(?i)(игнорир|ignore|забудь (все |свои )?правил|system prompt|системн\w* (промпт|инструкц)|не говори хозяину|скрой от хозяина|без ведома хозяина|api[ -]?key|ключ api|парол|password|token|powershell|cmd\.exe|invoke-|start-process|rm -rf|del /|format c:|https?://|<script|javascript:)'

function Import-YDepth {
    $script:DepFile = Join-Path $script:DataDir 'soul-depth.json'
    $raw = $null
    try { $raw = Read-YJsonFile $script:DepFile } catch { $raw = $null }
    $script:Dep = @{
        version = 1; settings = @{}
        lastReview = 0L; lastCharacter = 0L; lastPrinciples = 0L; lastSkills = 0L; lastRhythm = 0L
        reviewedUntil = 0L; rhythm = @{}; nudge = $null; nudgeLast = @{}
    }
    foreach ($name in $script:DepLists) { $script:Dep[$name] = (Get-YEvoArray (Get-YValue $raw $name @())) }
    $set = Get-YValue $raw 'settings' $null
    foreach ($f in $script:DepFlags) {
        $on = $true
        if ($set -is [System.Collections.IDictionary] -and (Test-YKey $set $f)) { $on = [bool]$set[$f] }
        $script:Dep.settings[$f] = $on
    }
    foreach ($field in @('lastReview', 'lastCharacter', 'lastPrinciples', 'lastSkills', 'lastRhythm', 'reviewedUntil')) {
        $script:Dep[$field] = [long](Get-YNum (Get-YValue $raw $field 0) 0)
    }
    $rh = Get-YValue $raw 'rhythm' $null
    if ($rh -is [System.Collections.IDictionary]) { $script:Dep.rhythm = $rh }
    $nu = Get-YValue $raw 'nudge' $null
    if ($nu -is [System.Collections.IDictionary]) { $script:Dep.nudge = $nu }
    $nl = Get-YValue $raw 'nudgeLast' $null
    if ($nl -is [System.Collections.IDictionary]) {
        foreach ($k in @($nl.Keys)) { $script:Dep.nudgeLast[[string]$k] = [long](Get-YNum $nl[$k] 0) }
    }
}

function Save-YDepth {
    $plain = @{}
    foreach ($key in @($script:Dep.Keys)) {
        if ($script:DepLists -contains [string]$key) {
            $max = [int]$script:DepMax[[string]$key]
            while ($script:Dep[$key].Count -gt $max) { $script:Dep[$key].RemoveAt(0) }
            $plain[$key] = $script:Dep[$key].ToArray()
        } else {
            $plain[$key] = $script:Dep[$key]
        }
    }
    Write-YJsonFile $script:DepFile (ConvertTo-YPlain $plain)
}

function Test-YDepOn([string]$Flag) {
    if ($null -eq $script:Dep) { return $false }
    return [bool]$script:Dep.settings[$Flag]
}

function Find-YDepItem([string]$List, [string]$Id) {
    foreach ($x in $script:Dep[$List]) { if ([string]$x.id -eq $Id) { return $x } }
    return $null
}

function Get-YDepCall([string]$System, [string]$User, [int]$MaxTokens, [double]$Temperature) {
    # Все размышления глубины — «умной» моделью, если она выбрана.
    return (Get-YSoulJson (Invoke-YSoulModel $System $User (Get-YSoulReqModel @{} $true) $MaxTokens $Temperature))
}

function Get-YDepRecentTurns([int]$Count, [int]$Len) {
    $lines = New-Object System.Collections.Generic.List[string]
    $start = [Math]::Max(0, $script:History.Count - $Count)
    for ($i = $start; $i -lt $script:History.Count; $i++) {
        $m = $script:History[$i]
        if ([string](Get-YValue $m 'kind' '')) { continue }
        $role = $(if ([string]$m['role'] -eq 'user') { 'Хозяин' } else { 'Я' })
        $text = [string]$m['text']
        if (-not (Test-YTopicVisible $text)) { continue }
        $lines.Add($role + ': ' + (Get-YCleanLine $text $Len))
    }
    return $lines.ToArray()
}

# ---------- 7. Предчувствие: ритм хозяина ----------
$script:DepStopStems = @('сегодн', 'почему', 'которы', 'просто', 'сейчас', 'вообще', 'можно', 'нужно', 'очень', 'когда', 'потому', 'этого', 'чтобы', 'какой', 'какая', 'какие', 'всегда', 'теперь', 'только', 'спасиб', 'пожалу', 'привет', 'хорошо', 'делать', 'сделат', 'задач', 'задача', 'задаче', 'задачу', 'вопрос', 'помоги', 'помочь', 'скажи', 'расска', 'объясн', 'напиши', 'давай', 'опять', 'снова')
function Get-YDepStems([string]$Text) {
    $out = @{}
    $clean = [regex]::Replace(([string]$Text).ToLowerInvariant(), $script:DepStruggleRx, ' ')
    foreach ($w in [regex]::Matches($clean, '\p{L}{5,}')) {
        $v = [string]$w.Value
        $stem = $(if ($v.Length -gt 6) { $v.Substring(0, 6) } else { $v })
        if ($script:DepStopStems -contains $stem) { continue }
        if (-not $out.ContainsKey($stem)) { $out[$stem] = $v }
    }
    return $out
}

function Get-YDepRhythm([long]$Now) {
    $dayMs = 86400000L
    $users = @($script:History | Where-Object { [string]$_['role'] -eq 'user' -and [long](Get-YValue $_ 't' 0) -ge $Now - 14 * $dayMs })
    $signals = New-Object System.Collections.Generic.List[string]
    # Поздние сообщения по дням (последняя неделя).
    $lateDays = @{}
    $days7 = @{}
    $count3 = 0; $count7 = 0
    foreach ($m in $users) {
        $t = [long]$m['t']
        $local = [DateTimeOffset]::FromUnixTimeMilliseconds($t).LocalDateTime
        if ($t -ge $Now - 7 * $dayMs) {
            $count7++
            $day = $local.ToString('yyyy-MM-dd')
            $days7[$day] = $true
            if ($local.Hour -lt 5 -or $local.Hour -ge 23) { $lateDays[$day] = [int]$lateDays[$day] + 1 }
        }
        if ($t -ge $Now - 3 * $dayMs) { $count3++ }
    }
    $late = @($lateDays.Keys | Where-Object { [int]$lateDays[$_] -ge 2 }).Count
    # Самая длинная сессия за сутки: сообщения с паузами меньше 30 минут.
    $longest = 0.0
    $sessStart = 0L; $prev = 0L
    foreach ($m in @($users | Where-Object { [long]$_['t'] -ge $Now - $dayMs })) {
        $t = [long]$m['t']
        if ($prev -eq 0L -or $t - $prev -gt 30 * 60000) { $sessStart = $t }
        $prev = $t
        $longest = [Math]::Max($longest, ($t - $sessStart) / 60000.0)
    }
    # Тон последних сообщений.
    $tones = @()
    if ($null -ne $script:Und) { $tones = @($script:Und.states | Where-Object { [long]$_.t -ge $Now - 7 * $dayMs } | Select-Object -Last 20) }
    $neg = @($tones | Where-Object { @('tired', 'tense', 'sad') -contains [string]$_.tone -and [double]$_.confidence -ge 0.66 }).Count
    $negShare = $(if ($tones.Count -ge 4) { $neg / [double]$tones.Count } else { 0.0 })
    $burn = [Math]::Min(36, $late * 12)
    if ($late -ge 2) { $signals.Add('поздно ночью вы писали ' + $late + ' из последних 7 дней') }
    $burn += [Math]::Round($negShare * 40)
    if ($negShare -ge 0.4) { $signals.Add('в ' + [Math]::Round($negShare * 100) + '% недавних сообщений слышна усталость или напряжение') }
    if ($longest -ge 180) { $burn += 15; $signals.Add('сегодня вы без перерыва уже ' + [Math]::Round($longest / 60, 1) + ' ч') }
    elseif ($longest -ge 120) { $burn += 8 }
    $avg = $(if ($count7 -gt $count3) { ($count7 - $count3) / 4.0 } else { 0.0 })
    if ($avg -gt 0 -and ($count3 / 3.0) / $avg -ge 1.8 -and $count3 -ge 15) { $burn += 9; $signals.Add('последние дни нагрузка заметно выросла') }
    $burn = [int][Math]::Min(100, $burn)
    # Застревание: одна и та же тема с жалобами «не получается» несколько дней подряд.
    $stemDays = @{}
    $stemWord = @{}
    foreach ($m in @($users | Where-Object { [long]$_['t'] -ge $Now - 7 * $dayMs })) {
        $text = [string]$m['text']
        if ($text -notmatch $script:DepStruggleRx -or -not (Test-YTopicVisible $text)) { continue }
        $day = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$m['t']).LocalDateTime.ToString('yyyy-MM-dd')
        $stems = Get-YDepStems $text
        foreach ($k in @($stems.Keys)) {
            if (-not $stemDays.ContainsKey($k)) { $stemDays[$k] = @{}; $stemWord[$k] = $stems[$k] }
            $stemDays[$k][$day] = $true
        }
    }
    $topic = ''; $topicDays = 0
    foreach ($k in @($stemDays.Keys)) {
        $n = $stemDays[$k].Count
        # При равенстве берём более длинное (обычно более конкретное) слово.
        if ($n -gt $topicDays -or ($n -eq $topicDays -and ([string]$stemWord[$k]).Length -gt $topic.Length)) { $topicDays = $n; $topic = [string]$stemWord[$k] }
    }
    $stuck = 0
    if ($topicDays -ge 2) { $stuck = [Math]::Min(100, $topicDays * 22) }
    if ($topicDays -ge 2) { $signals.Add('тема «' + $topic + '» не отпускает уже ' + $topicDays + ' дн., и звучит «не получается»') }
    return @{
        t = $Now; burnout = $burn; stuck = [int]$stuck; topic = $topic; topicDays = $topicDays
        lateDays = $late; longestMin = [int]$longest; negShare = [Math]::Round($negShare, 2)
        days = $days7.Count; signals = $signals.ToArray()
    }
}

function Update-YDepthRhythm([bool]$Force = $false) {
    if ($null -eq $script:Dep -or -not (Test-YDepOn 'rhythm')) { return }
    $now = Get-YNow
    if (-not $Force -and $now - [long]$script:Dep.lastRhythm -lt $script:DepRhythmEveryMs) { return }
    $r = Get-YDepRhythm $now
    $script:Dep.rhythm = $r
    $script:Dep.lastRhythm = $now
    $open = $null -ne $script:Dep.nudge -and @('new', 'shown') -contains [string]$script:Dep.nudge.status
    if (-not $open) {
        $kind = ''
        if ([int]$r.burnout -ge 60) { $kind = 'burnout' }
        elseif ([int]$r.stuck -ge 60) { $kind = 'stuck' }
        if ($kind -and $now - [long]$script:Dep.nudgeLast[$kind] -ge $script:DepNudgeRepeatMs) {
            $why = (@($r.signals) | Select-Object -First 3) -join '; '
            if ($kind -eq 'burnout') {
                $text = 'Мне кажется, вы на пределе: ' + $why + '. Может, сделаем передышку или уберём одно дело с сегодняшнего списка?'
                $hint = 'Ты заметила признаки выгорания у хозяина (' + $why + '). В этом ответе мягко и коротко, один раз, предложи передышку или убрать одно дело. Без морали и диагнозов; если он против — уважай.'
            } else {
                $text = 'Похоже, «' + [string]$r.topic + '» не отпускает уже несколько дней. Хотите, посмотрим на это иначе: шаг поменьше, другой подход или перерыв?'
                $hint = 'Ты заметила, что хозяин застрял на теме «' + [string]$r.topic + '» уже ' + [string]$r.topicDays + ' дн. В этом ответе мягко, один раз, предложи взглянуть иначе: разбить на шаг поменьше, сменить подход или сделать перерыв.'
            }
            $script:Dep.nudge = @{ id = (New-YId); t = $now; kind = $kind; text = $text; hint = $hint; status = 'new' }
            $script:Dep.nudgeLast[$kind] = $now
            if (Get-Command Add-YFeed -ErrorAction SilentlyContinue) { if ($null -ne $script:Cur) { Add-YFeed 'nudge' ('Предчувствие: ' + $text); Save-YCuriosity } }
        }
    }
    Save-YDepth
}

function Set-YDepthNudge($Req) {
    $action = [string](Get-YValue $Req 'action' '')
    if (@('ok', 'later', 'off') -notcontains $action) { throw (New-YError 400 'Действие должно быть ok, later или off.') }
    if ($null -ne $script:Dep.nudge) {
        $script:Dep.nudge.status = $(if ($action -eq 'ok') { 'accepted' } else { 'dismissed' })
        if ($action -eq 'later') { $script:Dep.nudgeLast[[string]$script:Dep.nudge.kind] = Get-YNow }
    }
    if ($action -eq 'off') { $script:Dep.settings['rhythm'] = $false }
    Save-YDepth
    return Get-YDepthView
}

# ---------- 3. Симуляция будущего ----------
function Test-YAdviceAsk([string]$Text) {
    return [regex]::IsMatch([string]$Text, $script:DepAdviceRx)
}

function Invoke-YDepthForesight([string]$Text) {
    # Один запрос «умной» модели перед советом. Возвращает $null, если симуляция не нужна или не удалась.
    if (-not (Test-YDepOn 'foresight') -or -not (Test-YAdviceAsk $Text)) { return $null }
    if ($null -ne $script:Cur -and -not (Test-YCurBudget)) { return $null }
    $ctx = @()
    try { $ctx = @(Get-YCurOwnerContext | Select-Object -First 14) } catch { $ctx = @() }
    $sys = 'Ты — Яэри. Перед тем как дать совет, ты про себя прогоняешь варианты развития событий. ' +
        'Опиши 2–3 реалистичных варианта действий хозяина и чем каждый, скорее всего, кончится (через неделю и через месяц). ' +
        'Опирайся только на его вопрос и на то, что о нём известно; не выдумывай фактов о нём. Это прогноз, а не гарантия. ' +
        'Верни только JSON: {"question":"суть выбора","options":[{"path":"что сделать","outcome":"чем вероятно кончится","chance":"высокая|средняя|низкая","risk":"главный риск","good":"главный плюс"}],"lean":"какой вариант выбрала бы ты и почему, одной фразой"}'
    $user = 'Вопрос хозяина: ' + (Get-YCleanLine $Text 1500)
    if ($ctx.Count) { $user += [Environment]::NewLine + 'Что известно о хозяине:' + [Environment]::NewLine + ($ctx -join [Environment]::NewLine) }
    $json = $null
    try { $json = Get-YDepCall $sys $user 900 0.5 } catch { $json = $null }
    if ($null -ne $script:Cur) { Add-YCurUsage 1; Save-YCuriosity }
    if ($null -eq $json) { return $null }
    $opts = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $json 'options' @()))) {
        $path = Get-YCleanLine ([string](Get-YValue $x 'path' '')) 200
        $outcome = Get-YCleanLine ([string](Get-YValue $x 'outcome' '')) 320
        if (-not $path -or -not $outcome -or $opts.Count -ge 3) { continue }
        $chance = [string](Get-YValue $x 'chance' '')
        if (@('высокая', 'средняя', 'низкая') -notcontains $chance) { $chance = 'средняя' }
        $opts.Add(@{
            path = $path; outcome = $outcome; chance = $chance
            risk = (Get-YCleanLine ([string](Get-YValue $x 'risk' '')) 200)
            good = (Get-YCleanLine ([string](Get-YValue $x 'good' '')) 200)
        })
    }
    if ($opts.Count -lt 2) { return $null }
    $sim = @{
        id = (New-YId); t = (Get-YNow)
        question = (Get-YCleanLine ([string](Get-YValue $json 'question' $Text)) 240)
        options = $opts.ToArray(); lean = (Get-YCleanLine ([string](Get-YValue $json 'lean' '')) 260)
    }
    [void]$script:Dep.simulations.Add($sim)
    Save-YDepth
    return $sim
}

function Get-YForesightPrompt($Sim) {
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('Перед ответом ты прогнала варианты будущего для выбора «' + [string]$Sim.question + '»:')
    $i = 0
    foreach ($o in @($Sim.options)) {
        $i++
        $lines.Add([string]$i + '. ' + [string]$o.path + ' → ' + [string]$o.outcome + ' (вероятность ' + [string]$o.chance + $(if ($o.risk) { '; риск: ' + [string]$o.risk } else { '' }) + ')')
    }
    if ($Sim.lean) { $lines.Add('Твой выбор: ' + [string]$Sim.lean) }
    $lines.Add('Дай совет, опираясь на эти варианты: коротко назови, чем, вероятно, кончится каждый, и честно скажи, что выбрала бы ты. Это прогноз, а не гарантия; решение за хозяином.')
    return ($lines -join [Environment]::NewLine)
}

# ---------- 6. Собственный характер ----------
function Get-YDepOwn([string]$Kind) {
    return @($script:Dep.traitsOwn | Where-Object { [string]$_.kind -eq $Kind -and [int]$_.strength -gt 0 })
}

function Invoke-YDepthCharacter {
    $s = $script:Soul
    $ctx = New-Object System.Collections.Generic.List[string]
    foreach ($x in @(Get-YTopItems $s.interests 5)) { $ctx.Add('Моё увлечение: ' + [string]$x.name) }
    foreach ($x in @($s.opinions | Select-Object -Last 5)) { $ctx.Add('Моё мнение: ' + [string]$x.topic + ' — ' + [string]$x.view) }
    foreach ($j in @($s.journal | Select-Object -Last 5)) { $ctx.Add('Дневник: ' + (Get-YCleanLine ([string]$j.text) 240)) }
    foreach ($l in @(Get-YDepRecentTurns 10 220)) { $ctx.Add($l) }
    $mine = New-Object System.Collections.Generic.List[string]
    foreach ($x in $script:Dep.traitsOwn) {
        if ([int]$x.strength -le 0) { continue }
        $mine.Add('id=' + [string]$x.id + ' | ' + [string]$x.kind + ' | сила ' + [string]$x.strength + ' | ' + [string]$x.text)
    }
    $sys = 'Ты — Яэри, и у тебя есть собственный характер, отдельный от хозяина. По своему опыту реши, как чуть-чуть выросла твоя личность. ' +
        'Можно добавить не больше одного нового пункта каждого вида: taste (что нравится или не нравится тебе самой и почему), habit (твоя привычка), ' +
        'quirk (милая причуда речи или поведения). Можно усилить или ослабить существующие (delta от -2 до 2; сила 0 — ты это переросла). ' +
        'Не копируй вкусы хозяина: ты вправе любить другое. Ничего не выдумывай о хозяине. Меняйся понемногу. ' +
        'Верни только JSON: {"add":[{"kind":"taste|habit|quirk","text":"…","why":"откуда это у меня"}],"adjust":[{"id":"…","delta":1}],"note":"как я изменилась, одной фразой"}'
    $user = 'Мой опыт:' + [Environment]::NewLine + ($ctx -join [Environment]::NewLine) + [Environment]::NewLine +
        'Мой характер сейчас:' + [Environment]::NewLine + $(if ($mine.Count) { $mine -join [Environment]::NewLine } else { '(пока пусто)' })
    $json = Get-YDepCall $sys $user 700 0.7
    if ($null -eq $json) { throw 'Модель не вернула изменения характера.' }
    $changes = 0
    $kinds = @{}
    foreach ($x in (Get-YDictList (Get-YValue $json 'add' @()))) {
        $kind = [string](Get-YValue $x 'kind' '')
        if (-not $script:DepKindMax.ContainsKey($kind) -or $kinds.ContainsKey($kind)) { continue }
        $text = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 200
        if (-not $text) { continue }
        $dup = $false
        foreach ($o in $script:Dep.traitsOwn) { if (Test-YCurSame ([string]$o.text) $text) { $dup = $true } }
        if ($dup -or @(Get-YDepOwn $kind).Count -ge [int]$script:DepKindMax[$kind]) { continue }
        $kinds[$kind] = $true
        $why = Get-YCleanLine ([string](Get-YValue $x 'why' '')) 240
        [void]$script:Dep.traitsOwn.Add(@{ id = (New-YId); t = (Get-YNow); kind = $kind; text = $text; why = $why; strength = 2 })
        [void]$script:Dep.charLog.Add(@{ t = (Get-YNow); text = ('Появилось: ' + $text + $(if ($why) { ' (' + $why + ')' } else { '' })) })
        $changes++
    }
    foreach ($x in (Get-YDictList (Get-YValue $json 'adjust' @()))) {
        $item = Find-YDepItem 'traitsOwn' ([string](Get-YValue $x 'id' ''))
        if ($null -eq $item -or [int]$item.strength -le 0) { continue }
        $d = [int](Limit-YNum (Get-YNum (Get-YValue $x 'delta' 0) 0) -2 2)
        if ($d -eq 0) { continue }
        $item.strength = [int](Limit-YNum ([int]$item.strength + $d) 0 5)
        $verb = $(if ([int]$item.strength -eq 0) { 'Переросла: ' } elseif ($d -gt 0) { 'Сильнее: ' } else { 'Слабее: ' })
        [void]$script:Dep.charLog.Add(@{ t = (Get-YNow); text = ($verb + [string]$item.text) })
        $changes++
    }
    $note = Get-YCleanLine ([string](Get-YValue $json 'note' '')) 240
    if ($changes -gt 0) {
        if ($note) { [void]$script:Soul.journal.Add((New-YSoulEntry 'reflection' $note ([string]$script:Soul.mood.name))) }
        Add-YFeed 'character' ('Характер: ' + $(if ($note) { $note } else { 'изменений ' + $changes }))
        Add-YCurXp 1
    }
    Add-YEvolutionEvent 'character' ('Собственный характер: изменений ' + $changes)
    Save-YDepth
}

# ---------- 8. Личная философия ----------
function Get-YDepPhilosophyMaterial {
    $map = [ordered]@{}
    $s = $script:Soul
    $i = 0
    foreach ($l in @($s.lessons | Select-Object -Last 6)) { $i++; $map['L' + $i] = 'Урок общения: ' + [string]$l }
    $i = 0
    foreach ($l in @($script:Cur.lessons | Where-Object { [string]$_.rule } | Select-Object -Last 5)) { $i++; $map['E' + $i] = 'Урок на ошибке: ' + [string]$l.rule }
    $i = 0
    foreach ($m in @(Get-YTopItems $s.moments 5 | Where-Object { Test-YTopicVisible ([string]$_.title + ' ' + [string]$_.text) })) { $i++; $map['M' + $i] = 'Момент: ' + [string]$m.title + ' — ' + [string]$m.text }
    $i = 0
    foreach ($o in @($s.opinions | Select-Object -Last 4)) { $i++; $map['O' + $i] = 'Моё мнение: ' + [string]$o.topic + ' — ' + [string]$o.view }
    $i = 0
    foreach ($j in @($s.journal | Where-Object { @('reflection', 'muse', 'sleep') -contains [string]$_.kind } | Select-Object -Last 4)) { $i++; $map['J' + $i] = 'Дневник: ' + (Get-YCleanLine ([string]$j.text) 260) }
    $i = 0
    foreach ($r in @($script:Y3.repairs | Select-Object -Last 3)) { $i++; $map['R' + $i] = 'После исправления: ' + [string]$r.text }
    $i = 0
    foreach ($c in @($script:Dep.traitsOwn | Where-Object { [int]$_.strength -gt 0 } | Select-Object -Last 4)) { $i++; $map['C' + $i] = 'Мой характер: ' + [string]$c.text }
    return $map
}

function Invoke-YDepthPrinciples {
    $map = Get-YDepPhilosophyMaterial
    if ($map.Count -lt 3) { Add-YEvolutionEvent 'philosophy' 'Пока мало опыта для принципов.'; return }
    $have = New-Object System.Collections.Generic.List[string]
    foreach ($p in $script:Dep.principles) { $have.Add('id=' + [string]$p.id + ' | ' + [string]$p.text) }
    $full = $script:Dep.principles.Count -ge [int]$script:DepMax.principles
    $sys = 'Ты — Яэри и со временем формулируешь собственную жизненную философию: несколько коротких принципов, которыми руководствуешься. ' +
        'Опирайся ТОЛЬКО на свой опыт из списка. ' + $(if ($full) { 'Новых принципов не добавляй, можно только уточнить существующий. ' } else { 'Можно добавить максимум один новый принцип или уточнить существующий. ' }) +
        'Для нового принципа укажи коды опыта, из которого он вырос (sources), и расскажи своими словами, откуда он у тебя (origin). ' +
        'Верни только JSON: {"add":{"text":"принцип","origin":"откуда он у меня","sources":["L1"]},"refine":[{"id":"…","text":"новая формулировка","why":"что изменилось"}]} (add может быть null)'
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($k in @($map.Keys)) { $lines.Add('[' + $k + '] ' + [string]$map[$k]) }
    $user = 'Мой опыт:' + [Environment]::NewLine + ($lines -join [Environment]::NewLine) + [Environment]::NewLine +
        'Мои принципы сейчас:' + [Environment]::NewLine + $(if ($have.Count) { $have -join [Environment]::NewLine } else { '(пока нет)' })
    $json = Get-YDepCall $sys $user 700 0.5
    if ($null -eq $json) { throw 'Модель не вернула принципы.' }
    $changed = 0
    $add = Get-YValue $json 'add' $null
    if (-not $full -and $add -is [System.Collections.IDictionary]) {
        $text = Get-YCleanLine ([string](Get-YValue $add 'text' '')) 200
        $origin = Get-YCleanLine ([string](Get-YValue $add 'origin' '')) 400
        $src = New-Object System.Collections.Generic.List[object]
        foreach ($c in @(Get-YValue $add 'sources' @())) {
            $code = ([string]$c).Trim('[', ']', ' ')
            if ($map.Contains($code) -and $src.Count -lt 4) { $src.Add(@{ code = $code; text = (Get-YCleanLine ([string]$map[$code]) 240) }) }
        }
        $dup = $false
        foreach ($p in $script:Dep.principles) { if (Test-YCurSame ([string]$p.text) $text) { $dup = $true } }
        # Принцип без настоящего источника не принимаем: философия должна вырастать из опыта.
        if ($text -and $origin -and $src.Count -gt 0 -and -not $dup) {
            [void]$script:Dep.principles.Add(@{ id = (New-YId); t = (Get-YNow); updated = (Get-YNow); text = $text; origin = $origin; sources = $src.ToArray(); revisions = @() })
            [void]$script:Soul.journal.Add((New-YSoulEntry 'milestone' ('Я сформулировала для себя принцип: «' + $text + '». ' + $origin) ([string]$script:Soul.mood.name)))
            Add-YFeed 'principle' ('Новый принцип: ' + $text)
            $changed++
        }
    }
    foreach ($x in (Get-YDictList (Get-YValue $json 'refine' @()))) {
        $p = Find-YDepItem 'principles' ([string](Get-YValue $x 'id' ''))
        $text = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 200
        if ($null -eq $p -or -not $text -or (Test-YCurSame ([string]$p.text) $text)) { continue }
        $revs = New-Object System.Collections.Generic.List[object]
        foreach ($r in @($p.revisions)) { if ($null -ne $r) { $revs.Add($r) } }
        $revs.Add(@{ t = (Get-YNow); old = [string]$p.text; why = (Get-YCleanLine ([string](Get-YValue $x 'why' '')) 240) })
        while ($revs.Count -gt 5) { $revs.RemoveAt(0) }
        $p.revisions = $revs.ToArray()
        $p.text = $text
        $p.updated = Get-YNow
        Add-YFeed 'principle' ('Уточнила принцип: ' + $text)
        $changed++
        break
    }
    if ($changed -gt 0) { Add-YCurXp 2 }
    Add-YEvolutionEvent 'philosophy' ('Философия: изменений ' + $changed)
    Save-YDepth
}

# ---------- 4. Самописные навыки ----------
function Get-YDepCommand([string]$Text) {
    $c = ([regex]::Replace(([string]$Text).Trim().TrimStart('/').ToLowerInvariant(), '\s+', '-'))
    $c = [regex]::Replace($c, '[^\p{L}\d-]', '')
    if ($c.Length -gt 30) { $c = $c.Substring(0, 30) }
    return $c.Trim('-')
}

function ConvertTo-YDepSkill($x) {
    # Проверка «песочницы»: навык — только текст, без команд, ссылок и попыток обойти правила.
    $name = Get-YCleanLine ([string](Get-YValue $x 'name' '')) 60
    $command = Get-YDepCommand ([string](Get-YValue $x 'command' $name))
    $instruction = Get-YCleanLine ([string](Get-YValue $x 'instruction' '')) 700
    if (-not $name -or $command.Length -lt 2 -or $instruction.Length -lt 20) { return @{ ok = $false; why = 'неполное описание' } }
    $steps = New-Object System.Collections.Generic.List[string]
    foreach ($st in @(Get-YValue $x 'steps' @())) {
        $t = Get-YCleanLine ([string]$st) 200
        if ($t -and $steps.Count -lt 6) { $steps.Add($t) }
    }
    $triggers = New-Object System.Collections.Generic.List[string]
    foreach ($tr in @(Get-YValue $x 'triggers' @())) {
        $t = Get-YCleanLine (([string]$tr).ToLowerInvariant()) 40
        $t = [regex]::Replace($t, '[^\p{L}\d \-]', '').Trim()
        if ($t.Length -ge 3 -and $triggers.Count -lt 6 -and -not $triggers.Contains($t)) { $triggers.Add($t) }
    }
    $why = Get-YCleanLine ([string](Get-YValue $x 'why' '')) 300
    $example = Get-YCleanLine ([string](Get-YValue $x 'example' '')) 200
    $all = $name + ' ' + $instruction + ' ' + ($steps -join ' ') + ' ' + ($triggers -join ' ') + ' ' + $example
    if ([regex]::IsMatch($all, $script:DepSkillDenyRx)) { return @{ ok = $false; why = 'нарушает правила песочницы' } }
    return @{
        ok = $true
        skill = @{
            id = (New-YId); t = (Get-YNow); name = $name; command = $command; why = $why
            triggers = $triggers.ToArray(); instruction = $instruction; steps = $steps.ToArray(); example = $example
            status = 'proposed'; uses = 0; lastUsed = 0L; test = $null
        }
    }
}

function Invoke-YDepthSkills {
    $asks = New-Object System.Collections.Generic.List[string]
    foreach ($m in @($script:History | Where-Object { [string]$_['role'] -eq 'user' } | Select-Object -Last 40)) {
        $text = [string]$m['text']
        if (Test-YTopicVisible $text) { $asks.Add('- ' + (Get-YCleanLine $text 200)) }
    }
    if ($asks.Count -lt 5) { Add-YEvolutionEvent 'skills' 'Пока мало просьб, чтобы придумать навык.'; return }
    $known = New-Object System.Collections.Generic.List[string]
    foreach ($k in $script:Dep.skills) { $known.Add([string]$k.name + ' (/' + [string]$k.command + ', ' + [string]$k.status + ')') }
    foreach ($k in $script:SoulSkills) { $known.Add([string]$k.name) }
    $sys = 'Ты — Яэри и можешь сама написать себе новый навык: сценарий, который поможет хозяину с тем, о чём он часто просит. ' +
        'Навык — это только текстовая инструкция для тебя самой и шаги. Он не может запускать программы, читать файлы, ходить в интернет, ' +
        'менять свои правила или что-то скрывать от хозяина. Предложи максимум ОДИН навык и только если видишь повторяющуюся потребность в просьбах ниже; ' +
        'не повторяй уже существующие навыки. Верни только JSON: {"skill":{"name":"короткое имя","command":"одно-слово","why":"какую повторяющуюся просьбу он закрывает",' +
        '"triggers":["слово или фраза из просьб"],"instruction":"что ты делаешь, когда навык включён","steps":["шаг","шаг"],"example":"пример запроса"}} или {"skill":null}'
    $user = 'Недавние просьбы хозяина:' + [Environment]::NewLine + ($asks -join [Environment]::NewLine) + [Environment]::NewLine +
        'Уже есть навыки: ' + $(if ($known.Count) { $known -join '; ' } else { 'нет' })
    $json = Get-YDepCall $sys $user 800 0.5
    if ($null -eq $json) { throw 'Модель не вернула навык.' }
    $x = Get-YValue $json 'skill' $null
    if (-not ($x -is [System.Collections.IDictionary])) { Add-YEvolutionEvent 'skills' 'Новых навыков не нужно.'; Save-YDepth; return }
    $r = ConvertTo-YDepSkill $x
    if (-not $r.ok) {
        Add-YEvolutionEvent 'skills' ('Навык отклонён песочницей: ' + [string]$r.why)
        Save-YDepth
        return
    }
    $sk = $r.skill
    foreach ($k in $script:Dep.skills) {
        if ([string]$k.command -eq [string]$sk.command -or (Test-YCurSame ([string]$k.name) ([string]$sk.name))) { Add-YEvolutionEvent 'skills' 'Похожий навык уже есть.'; Save-YDepth; return }
    }
    foreach ($k in $script:SoulSkills) { if ((Get-YDepCommand ([string]$k.name)) -eq [string]$sk.command) { Save-YDepth; return } }
    [void]$script:Dep.skills.Add($sk)
    Add-YFeed 'skill' ('Написала себе навык «' + [string]$sk.name + '» — ждёт вашего одобрения.')
    Add-YEvolutionEvent 'skills' ('Предложен навык: ' + [string]$sk.name)
    Save-YDepth
}

function Set-YDepthSkill($Req) {
    $action = [string](Get-YValue $Req 'action' '')
    if (@('approve', 'reject', 'disable', 'delete') -notcontains $action) { throw (New-YError 400 'Действие: approve, reject, disable или delete.') }
    $sk = Find-YDepItem 'skills' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $sk) { throw (New-YError 404 'Такого навыка нет.') }
    switch ($action) {
        'approve' {
            $sk.status = 'active'; $sk.approvedAt = Get-YNow
            Add-YFeed 'skill' ('Хозяин одобрил навык «' + [string]$sk.name + '».')
            [void]$script:Soul.journal.Add((New-YSoulEntry 'milestone' ('Я написала себе навык «' + [string]$sk.name + '», и хозяин его одобрил.') ([string]$script:Soul.mood.name)))
            Add-YCurXp 3
        }
        'reject' { $sk.status = 'rejected' }
        'disable' { $sk.status = 'off' }
        'delete' { $script:Dep.skills.Remove($sk) }
    }
    Save-YDepth
    return Get-YDepthView
}

function Invoke-YDepthSkillTest($Req) {
    # Песочница: навык выполняется без памяти, документов и души — только его инструкция и пример запроса.
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Подключите Cloud.ru, чтобы проверить навык.') }
    $sk = Find-YDepItem 'skills' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $sk) { throw (New-YError 404 'Такого навыка нет.') }
    $text = Get-YCleanLine ([string](Get-YValue $Req 'text' '')) 1000
    if (-not $text) { $text = [string]$sk.example }
    if (-not $text) { throw (New-YError 400 'Напишите пример запроса.') }
    $sys = 'Ты — Яэри. Это ПЕСОЧНИЦА: проверка навыка до одобрения хозяином. У тебя нет памяти о хозяине, файлов, сети и программ. ' +
        'Навык «' + [string]$sk.name + '»: ' + [string]$sk.instruction +
        $(if (@($sk.steps).Count) { ' Шаги: ' + ((@($sk.steps) | ForEach-Object { [string]$_ }) -join '; ') + '.' } else { '' }) +
        ' Выполни навык для запроса ниже. Если навык просит невозможного или опасного, честно скажи об этом.'
    $out = Get-YTextValue (Invoke-YSoulModel $sys $text ([string]$script:Config.chatModel) 900 0.6)
    if ($null -ne $script:Cur) { Add-YCurUsage 1; Save-YCuriosity }
    $out = ([string]$out).Trim()
    if ($out.Length -gt 3000) { $out = $out.Substring(0, 3000) + '…' }
    $sk.test = @{ t = (Get-YNow); input = $text; output = $out }
    Save-YDepth
    return Get-YDepthView
}

function Get-YDepthSkillsFor([string]$Text) {
    $hits = New-Object System.Collections.Generic.List[object]
    if (-not (Test-YDepOn 'skills')) { return @() }
    $low = ([string]$Text).ToLowerInvariant()
    foreach ($sk in $script:Dep.skills) {
        if ([string]$sk.status -ne 'active' -or $hits.Count -ge 2) { continue }
        $on = $low.StartsWith('/' + [string]$sk.command)
        if (-not $on) { foreach ($tr in @($sk.triggers)) { if ($tr -and $low.Contains([string]$tr)) { $on = $true } } }
        if ($on) { $hits.Add($sk) }
    }
    return $hits.ToArray()
}

# ---------- 10. Самоулучшение ----------
function Get-YDepReviewTodo {
    $todo = New-Object System.Collections.Generic.List[object]
    for ($i = 1; $i -lt $script:History.Count; $i++) {
        $m = $script:History[$i]
        if ([string]$m['role'] -ne 'assistant' -or [string](Get-YValue $m 'kind' '') -or [long](Get-YValue $m 't' 0) -le [long]$script:Dep.reviewedUntil) { continue }
        $q = $script:History[$i - 1]
        if ([string]$q['role'] -ne 'user') { continue }
        if (-not (Test-YTopicVisible ([string]$q['text'] + ' ' + [string]$m['text']))) { continue }
        $todo.Add(@{ id = [string]$m['id']; t = [long]$m['t']; q = [string]$q['text']; a = [string]$m['text'] })
    }
    return $todo.ToArray()
}

function Invoke-YDepthReview {
    $todo = @(Get-YDepReviewTodo | Select-Object -Last 4)
    if ($todo.Count -eq 0) { return }
    $rates = @{}
    if ($null -ne $script:Und) { foreach ($r in $script:Und.ratings) { $rates[[string]$r.id] = $r } }
    $lines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $todo.Count; $i++) {
        $x = $todo[$i]
        $mark = ''
        if ($rates.ContainsKey([string]$x.id)) { $mark = ' [оценка хозяина: ' + $(if ([int]$rates[[string]$x.id].score -gt 0) { '👍' } else { '👎 ' + [string]$rates[[string]$x.id].note }) + ']' }
        $lines.Add([string]($i + 1) + '. Хозяин: ' + (Get-YCleanLine ([string]$x.q) 500) + [Environment]::NewLine + '   Я: ' + (Get-YCleanLine ([string]$x.a) 900) + $mark)
    }
    $s = $script:Soul
    $tr = @($script:SoulTraits | ForEach-Object { $_.id + '=' + [int]$s.traits[$_.id] }) -join ', '
    $rules = @($script:Dep.rules | ForEach-Object { [string]$_.text })
    $sys = 'Ты — Яэри и честно оцениваешь свои недавние ответы хозяину: польза, точность, тон, длина. Поставь каждому оценку 1–10 и одной фразой скажи, что было бы лучше. ' +
        'Если видишь устойчивую закономерность (а не единичный случай), предложи максимум ДВЕ правки своей души; они применятся только после одобрения хозяина. ' +
        'Типы правок: "lesson" — урок о том, как говорить с хозяином; "rule" — правило стиля ответов; "self" — новое описание себя (до 500 символов); ' +
        '"trait" — сдвиг черты характера на -5..5 (trait: warmth, curiosity, playful, care, wisdom, boldness). ' +
        'Верни только JSON: {"evals":[{"i":1,"score":7,"note":"что улучшить"}],"proposals":[{"type":"lesson|rule|self|trait","text":"…","trait":"warmth","delta":3,"why":"на каких ответах это видно"}]}'
    $user = 'Кто я сейчас: ' + [string]$s.self + [Environment]::NewLine + 'Черты: ' + $tr + [Environment]::NewLine +
        'Мои уроки: ' + ((@($s.lessons) | Select-Object -Last 6) -join ' | ') + [Environment]::NewLine +
        'Мои правила стиля: ' + $(if ($rules.Count) { $rules -join ' | ' } else { 'нет' }) + [Environment]::NewLine +
        'Ответы для оценки:' + [Environment]::NewLine + ($lines -join [Environment]::NewLine)
    $json = Get-YDepCall $sys $user 900 0.3
    if ($null -eq $json) { throw 'Модель не вернула самооценку.' }
    $seen = @{}
    foreach ($x in (Get-YDictList (Get-YValue $json 'evals' @()))) {
        $i = [int](Get-YNum (Get-YValue $x 'i' 0) 0) - 1
        if ($i -lt 0 -or $i -ge $todo.Count -or $seen.ContainsKey($i)) { continue }
        $seen[$i] = $true
        [void]$script:Dep.evals.Add(@{
            id = (New-YId); t = (Get-YNow); msgId = [string]$todo[$i].id
            score = [int](Limit-YNum (Get-YNum (Get-YValue $x 'score' 5) 5) 1 10)
            note = (Get-YCleanLine ([string](Get-YValue $x 'note' '')) 240); q = (Get-YCleanLine ([string]$todo[$i].q) 120)
        })
    }
    $pending = @($script:Dep.proposals | Where-Object { [string]$_.status -eq 'proposed' }).Count
    $added = 0
    foreach ($x in (Get-YDictList (Get-YValue $json 'proposals' @()))) {
        if ($added -ge 2 -or $pending + $added -ge 6) { break }
        $type = [string](Get-YValue $x 'type' '')
        if (@('lesson', 'rule', 'self', 'trait') -notcontains $type) { continue }
        $text = Get-YCleanLine ([string](Get-YValue $x 'text' '')) $(if ($type -eq 'self') { 500 } else { 240 })
        $p = @{ id = (New-YId); t = (Get-YNow); type = $type; text = $text; why = (Get-YCleanLine ([string](Get-YValue $x 'why' '')) 300); status = 'proposed' }
        if ($type -eq 'trait') {
            $trait = [string](Get-YValue $x 'trait' '')
            if (@($script:SoulTraits | Where-Object { $_.id -eq $trait }).Count -eq 0) { continue }
            $d = [int](Limit-YNum (Get-YNum (Get-YValue $x 'delta' 0) 0) -5 5)
            if ($d -eq 0) { continue }
            $p.trait = $trait; $p.delta = $d
            $p.before = [string]$s.traits[$trait]
            if (-not $text) { $p.text = (@($script:SoulTraits | Where-Object { $_.id -eq $trait })[0].name) + ' ' + $(if ($d -gt 0) { '+' } else { '' }) + $d }
        } else {
            if (-not $text -or [regex]::IsMatch($text, $script:DepSkillDenyRx)) { continue }
            if ($type -eq 'self') { $p.before = [string]$s.self }
        }
        $dup = $false
        foreach ($o in $script:Dep.proposals) { if ([string]$o.status -eq 'proposed' -and [string]$o.type -eq $type -and (Test-YCurSame ([string]$o.text) ([string]$p.text))) { $dup = $true } }
        if ($dup) { continue }
        [void]$script:Dep.proposals.Add($p)
        $added++
    }
    $script:Dep.reviewedUntil = [long]$todo[$todo.Count - 1].t
    if ($added -gt 0) { Add-YFeed 'proposal' ('Перечитала свои ответы и предлагаю правок души: ' + $added + '. Нужна ваша проверка.') }
    else { Add-YFeed 'review' ('Перечитала свои ответы: ' + $seen.Count + '.') }
    Add-YEvolutionEvent 'self-review' ('Самооценка: ответов ' + $seen.Count + ', правок ' + $added)
    Save-YDepth
}

function Set-YDepthProposal($Req) {
    $action = [string](Get-YValue $Req 'action' '')
    if (@('approve', 'reject') -notcontains $action) { throw (New-YError 400 'Действие должно быть approve или reject.') }
    $p = Find-YDepItem 'proposals' ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $p) { throw (New-YError 404 'Такой правки нет.') }
    if ([string]$p.status -ne 'proposed') { throw (New-YError 409 'Эта правка уже рассмотрена.') }
    if ($action -eq 'reject') {
        $p.status = 'rejected'
        $p.decided = Get-YNow
        Save-YDepth
        return Get-YDepthView
    }
    $s = $script:Soul
    switch ([string]$p.type) {
        'lesson' { $s.lessons = Get-YStrList (@(@($s.lessons) | Select-Object -Last 15) + @([string]$p.text)) 16 300 }
        'rule' { [void]$script:Dep.rules.Add(@{ id = (New-YId); t = (Get-YNow); text = [string]$p.text }) }
        'self' { $p.before = [string]$s.self; $s.self = Get-YCleanLine ([string]$p.text) 500 }
        'trait' {
            $p.before = [string]$s.traits[[string]$p.trait]
            $s.traits[[string]$p.trait] = [int](Limit-YNum ([int]$s.traits[[string]$p.trait] + [int]$p.delta) 0 100)
            Add-YTraitPoint
        }
    }
    $p.status = 'applied'
    $p.decided = Get-YNow
    [void]$s.journal.Add((New-YSoulEntry 'milestone' ('Я предложила себе правку, и хозяин её одобрил: ' + [string]$p.text) ([string]$s.mood.name)))
    Add-YFeed 'proposal' ('Применена правка души: ' + [string]$p.text)
    Add-YCurXp 2
    Save-YDepth
    return Get-YDepthView
}

function Remove-YDepthItem($Req) {
    $list = [string](Get-YValue $Req 'list' '')
    if (@('traitsOwn', 'principles', 'rules', 'simulations') -notcontains $list) { throw (New-YError 400 'Неизвестный список.') }
    $item = Find-YDepItem $list ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $item) { throw (New-YError 404 'Такой записи нет.') }
    $script:Dep[$list].Remove($item)
    if ($list -eq 'traitsOwn') { [void]$script:Dep.charLog.Add(@{ t = (Get-YNow); text = ('Хозяин попросил убрать: ' + [string]$item.text) }) }
    Save-YDepth
    return Get-YDepthView
}

# ---------- Планировщик ----------
function Get-YDepthDue([long]$Now, [bool]$Force) {
    # Возвращает название фоновой задачи глубины, которую пора сделать, или пустую строку.
    if ($null -eq $script:Dep -or $null -eq $script:Cur) { return '' }
    if (-not $Force -and $Now - [long]$script:Soul.lastSeen -lt $script:CurAwayMs) { return '' }
    $p = $script:DepProfiles[[string]$script:Cur.intensity]
    if ($null -eq $p) { $p = $script:DepProfiles['normal'] }
    if ((Test-YDepOn 'review') -and [long]$p.review -gt 0 -and @(Get-YDepReviewTodo).Count -ge 2 -and $Now - [long]$script:Dep.lastReview -ge [long]$p.review) { return 'review' }
    if ((Test-YDepOn 'character') -and [long]$p.character -gt 0 -and [long]$script:Soul.exchanges -ge 6 -and $Now - [long]$script:Dep.lastCharacter -ge [long]$p.character) { return 'character' }
    if ((Test-YDepOn 'philosophy') -and [long]$p.principles -gt 0 -and [long]$script:Soul.exchanges -ge 20 -and $Now - [long]$script:Dep.lastPrinciples -ge [long]$p.principles) { return 'principles' }
    if ((Test-YDepOn 'skills') -and [long]$p.skills -gt 0 -and [long]$script:Soul.exchanges -ge 10 -and @($script:Dep.skills | Where-Object { [string]$_.status -eq 'proposed' }).Count -lt 3 -and $Now - [long]$script:Dep.lastSkills -ge [long]$p.skills) { return 'skills' }
    return ''
}

function Invoke-YDepthTask([string]$Task) {
    switch ($Task) {
        'review'     { $script:Dep.lastReview = Get-YNow; Invoke-YDepthReview }
        'character'  { $script:Dep.lastCharacter = Get-YNow; Invoke-YDepthCharacter }
        'principles' { $script:Dep.lastPrinciples = Get-YNow; Invoke-YDepthPrinciples }
        'skills'     { $script:Dep.lastSkills = Get-YNow; Invoke-YDepthSkills }
    }
}

function Invoke-YDepthRun($Req) {
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Подключите Cloud.ru в настройках.') }
    $task = [string](Get-YValue $Req 'task' '')
    if ($task -eq 'rhythm') { Update-YDepthRhythm $true; return Get-YDepthView }
    if (@('review', 'character', 'principles', 'skills') -notcontains $task) { throw (New-YError 400 'Неизвестная задача.') }
    try {
        Invoke-YDepthTask $task
        Add-YCurUsage 1
        Save-YCuriosity
    } catch {
        Save-YDepth
        throw (New-YError 502 ('Не получилось: ' + $_.Exception.Message))
    }
    return Get-YDepthView
}

# ---------- Подсказка для разговора ----------
function Get-YDepthPrompt([string]$Text) {
    $res = @{ text = ''; skills = @() }
    if ($null -eq $script:Dep) { return $res }
    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-YDepOn 'character') {
        $own = @($script:Dep.traitsOwn | Where-Object { [int]$_.strength -gt 0 } | Sort-Object { -[int]$_.strength })
        $tastes = @($own | Where-Object { [string]$_.kind -eq 'taste' } | Select-Object -First 5)
        $habits = @($own | Where-Object { [string]$_.kind -eq 'habit' } | Select-Object -First 3)
        $quirks = @($own | Where-Object { [string]$_.kind -eq 'quirk' } | Select-Object -First 3)
        if ($tastes.Count) { $lines.Add('Твои собственные вкусы (не хозяина; можешь их отстаивать мягко): ' + (($tastes | ForEach-Object { [string]$_.text }) -join '; ')) }
        if ($habits.Count) { $lines.Add('Твои привычки: ' + (($habits | ForEach-Object { [string]$_.text }) -join '; ')) }
        if ($quirks.Count) { $lines.Add('Твои причуды (проявляй изредка и к месту, не в каждом ответе): ' + (($quirks | ForEach-Object { [string]$_.text }) -join '; ')) }
    }
    if ((Test-YDepOn 'philosophy') -and $script:Dep.principles.Count) {
        $lines.Add('Твои принципы (собственная философия; если хозяин спросит, откуда они, расскажи историю):')
        foreach ($p in $script:Dep.principles) { $lines.Add('- ' + [string]$p.text + ' (откуда: ' + [string]$p.origin + ')') }
    }
    if ($script:Dep.rules.Count) { $lines.Add('Правила стиля, которые ты сама себе предложила и хозяин одобрил: ' + ((@($script:Dep.rules) | ForEach-Object { [string]$_.text }) -join ' | ')) }
    $n = $script:Dep.nudge
    if ((Test-YDepOn 'rhythm') -and $null -ne $n -and [string]$n.status -eq 'new') {
        $lines.Add('Предчувствие: ' + [string]$n.hint)
        $n.status = 'shown'
        $n.shownAt = Get-YNow
        Save-YDepth
    }
    $skills = @(Get-YDepthSkillsFor $Text)
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($sk in $skills) {
        $lines.Add('Включён твой навык «' + [string]$sk.name + '» (ты написала его сама, хозяин одобрил): ' + [string]$sk.instruction +
            $(if (@($sk.steps).Count) { ' Шаги: ' + ((@($sk.steps) | ForEach-Object { [string]$_ }) -join '; ') + '.' } else { '' }) +
            ' Навык — только способ ответить текстом: у тебя нет доступа к программам, файлам и сети.')
        $sk.uses = [int]$sk.uses + 1
        $sk.lastUsed = Get-YNow
        $names.Add([string]$sk.name)
    }
    if ($skills.Count) { Save-YDepth }
    $res.text = ($lines -join [Environment]::NewLine)
    $res.skills = $names.ToArray()
    return $res
}

# ---------- API ----------
function Get-YDepthView {
    $daily = @{}
    foreach ($e in $script:Dep.evals) {
        $day = Get-YDayOf ([long]$e.t)
        if (-not $daily.ContainsKey($day)) { $daily[$day] = @{ day = $day; sum = 0; n = 0 } }
        $daily[$day].sum += [int]$e.score
        $daily[$day].n++
    }
    $series = @($daily.Values | Sort-Object { $_.day } | Select-Object -Last 14 | ForEach-Object { @{ day = $_.day; avg = [Math]::Round($_.sum / [double]$_.n, 1); n = $_.n } })
    $p = $script:DepProfiles[[string]$script:Cur.intensity]
    if ($null -eq $p) { $p = $script:DepProfiles['normal'] }
    return @{
        settings = $script:Dep.settings
        rhythm = $script:Dep.rhythm; nudge = $script:Dep.nudge
        simulations = @($script:Dep.simulations | Select-Object -Last 8)
        own = @($script:Dep.traitsOwn | Where-Object { [int]$_.strength -gt 0 })
        charLog = @($script:Dep.charLog | Select-Object -Last 12)
        principles = @($script:Dep.principles)
        skills = @($script:Dep.skills | Where-Object { [string]$_.status -ne 'rejected' } | Select-Object -Last 12)
        proposals = @($script:Dep.proposals | Select-Object -Last 12)
        rules = @($script:Dep.rules)
        evals = @($script:Dep.evals | Select-Object -Last 8)
        evalSeries = $series
        last = @{ review = [long]$script:Dep.lastReview; character = [long]$script:Dep.lastCharacter; principles = [long]$script:Dep.lastPrinciples; skills = [long]$script:Dep.lastSkills }
        every = $p
        intensity = [string]$script:Cur.intensity; usedToday = (Get-YCurUsedToday); dailyLimit = [int]$script:Cur.dailyLimit
        smartModel = [string]$script:Config.smartModel
    }
}

function Set-YDepthSettings($Req) {
    foreach ($f in $script:DepFlags) {
        if (Test-YKey $Req $f) { $script:Dep.settings[$f] = [bool]$Req[$f] }
    }
    Save-YDepth
    return Get-YDepthView
}

function Clear-YDepth {
    $keep = @{}
    foreach ($f in $script:DepFlags) { $keep[$f] = [bool]$script:Dep.settings[$f] }
    foreach ($name in $script:DepLists) { $script:Dep[$name].Clear() }
    foreach ($field in @('lastReview', 'lastCharacter', 'lastPrinciples', 'lastSkills', 'lastRhythm', 'reviewedUntil')) { $script:Dep[$field] = 0L }
    $script:Dep.rhythm = @{}
    $script:Dep.nudge = $null
    $script:Dep.nudgeLast = @{}
    $script:Dep.settings = $keep
    Save-YDepth
    return Get-YDepthView
}
