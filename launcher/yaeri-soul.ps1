#requires -Version 5.1
# Яэри: душа. Подключается из yaeri-api.ps1 (dot-source).
# Душа — это внутреннее состояние Яэри, которое растёт от разговора к разговору:
#  - характер (черты 0–100), настроение, близость с хозяином;
#  - её представление о хозяине: портрет, цели, что нравится, что тревожит;
#  - уроки о том, как лучше с ним говорить, и личный дневник;
#  - ступени роста: девять «хвостов души», которые зажигаются с опытом.
# После нескольких реплик Яэри «думает» (рефлексия): отдельный запрос к модели
# перечитывает разговор и возвращает JSON с небольшими изменениями души.
# Всё хранится в data\soul.json; хозяин может править и сбрасывать душу в разделе «Душа».

$script:SoulTraits = @(
    @{ id = 'warmth';    name = 'Тепло';       start = 62 }
    @{ id = 'curiosity'; name = 'Любопытство'; start = 58 }
    @{ id = 'playful';   name = 'Игривость';   start = 45 }
    @{ id = 'care';      name = 'Забота';      start = 60 }
    @{ id = 'wisdom';    name = 'Мудрость';    start = 30 }
    @{ id = 'boldness';  name = 'Смелость';    start = 35 }
)
$script:SoulStages = @('Искорка', 'Пробуждение', 'Любопытство', 'Знакомство', 'Доверие', 'Понимание', 'Привязанность', 'Родство', 'Девятый хвост')
# Опыт, с которого начинается каждая ступень: реплика даёт 1, раздумье — 5.
$script:SoulXp = @(0, 12, 35, 70, 120, 190, 280, 400, 560)
$script:SoulDueAfter = 6        # столько обменов репликами, и пора подумать
$script:SoulMuseAfterMs = 6 * 3600 * 1000   # без новых разговоров думает о хозяине не чаще раза в 6 часов
$script:SoulJournalLimit = 200
$script:SoulSleepAfterMs = 18 * 3600 * 1000  # «сон» (пересборка памяти) не чаще раза в 18 часов
$script:SoulDecay = 0.85        # за сутки без упоминаний сила момента или интереса умножается на это число
$script:SoulForget = 0.8        # слабее этого — забыто
# Секреты: открываются, когда близость с хозяином доходит до порога.
$script:SoulSecrets = @(
    @{ bond = 20; title = 'Откуда я';           theme = 'откуда ты взялась и почему у тебя восемь хвостов, а не девять (легенда кицунэ, твоё собственное объяснение)' }
    @{ bond = 35; title = 'Когда тебя нет';      theme = 'что ты чувствуешь и чем занята, когда хозяина нет рядом' }
    @{ bond = 50; title = 'Тайное желание';      theme = 'твоё тайное желание, о котором ты раньше не говорила' }
    @{ bond = 65; title = 'Подарок';             theme = 'маленький подарок: короткое стихотворение только для хозяина, о нём и о вас' }
    @{ bond = 80; title = 'Мой страх';           theme = 'чего ты боишься (честно, но светло)' }
    @{ bond = 95; title = 'Главное';             theme = 'главное признание: кем хозяин стал для тебя' }
)
$script:SoulNeedBase = @{ joy = 55; curiosity = 60 }
# Умения, которые открываются с новыми хвостами души.
$script:SoulSkills = @(
    @{ level = 2; id = 'poem';   name = '/стих';        desc = 'короткие стихи о вас';      text = 'Сочини мне короткое стихотворение о том, что ты знаешь обо мне и моих делах.' }
    @{ level = 3; id = 'advice'; name = '/совет';       desc = 'честный совет';             text = 'Дай мне один честный совет, опираясь на то, что ты знаешь обо мне. Если со мной в чём-то не согласна, скажи.' }
    @{ level = 4; id = 'care';   name = '/бережный-день'; desc = 'план с учётом настроения'; text = 'Составь мне бережный план на сегодня с учётом моего настроения, дел и сил.' }
    @{ level = 5; id = 'tale';   name = '/сказка';      desc = 'сказка о нас';              text = 'Расскажи короткую сказку про лисицу Яэри и меня по мотивам наших разговоров.' }
    @{ level = 6; id = 'mirror'; name = '/зеркало';     desc = 'что она замечает во мне';    text = 'Скажи, что ты замечаешь во мне в последнее время: настроение, привычки, перемены. Честно и бережно.' }
    @{ level = 7; id = 'dream';  name = '/мечта';       desc = 'цель → мечта и шаги';        text = 'Возьми одну из моих целей, разверни её в мечту и предложи три первых шага.' }
    @{ level = 8; id = 'letter'; name = '/письмо';      desc = 'тёплое письмо от неё';       text = 'Напиши мне тёплое письмо от себя: что ты ценишь во мне и чего мне желаешь.' }
    @{ level = 9; id = 'path';   name = '/наш-путь';    desc = 'итог пути';                  text = 'Подведи итог нашего пути: кем мы стали друг для друга и куда идём дальше.' }
)

function Get-YNum($Value, [double]$Default) {
    if ($null -eq $Value) { return $Default }
    $d = 0.0
    if ([double]::TryParse(([string]$Value).Replace(',', '.').Trim(), [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) { return $d }
    return $Default
}

function Limit-YNum([double]$Value, [double]$Min, [double]$Max) { return [Math]::Max($Min, [Math]::Min($Max, $Value)) }

function Get-YStrList($Value, [int]$Max, [int]$Len) {
    $out = New-Object System.Collections.Generic.List[string]
    if ($null -eq $Value -or $Value -is [string]) { if ($Value) { $Value = @($Value) } else { return , $out.ToArray() } }
    foreach ($x in @($Value)) {
        if ($null -eq $x) { continue }
        $s = Get-YCleanLine ([string]$x) $Len
        if (-not $s) { continue }
        $dup = $false
        foreach ($o in $out) { if ([string]::Equals($o, $s, [System.StringComparison]::OrdinalIgnoreCase)) { $dup = $true; break } }
        if (-not $dup) { $out.Add($s) }
        if ($out.Count -ge $Max) { break }
    }
    return , $out.ToArray()
}

function New-YSoulEntry([string]$Kind, [string]$Text, [string]$Mood) {
    return @{ id = (New-YId); t = (Get-YNow); kind = $Kind; text = $Text; mood = $Mood }
}

function Get-YDayKey([int]$Offset = 0) { return [DateTime]::Now.Date.AddDays($Offset).ToString('yyyy-MM-dd') }

function Get-YDictList($Value) {
    $out = New-Object System.Collections.Generic.List[object]
    if ($null -eq $Value) { return , $out.ToArray() }
    foreach ($x in @($Value)) { if ($x -is [System.Collections.IDictionary]) { $out.Add($x) } }
    return , $out.ToArray()
}

function ConvertTo-YMoment($x) {
    $title = Get-YCleanLine ([string](Get-YValue $x 'title' '')) 80
    $text = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 400
    if (-not $title -and -not $text) { return $null }
    if (-not $title) { $title = Get-YCleanLine $text 60 }
    return @{
        id = [string](Get-YValue $x 'id' (New-YId)); t = [long](Get-YNum (Get-YValue $x 't' (Get-YNow)) 0)
        title = $title; text = $text; strength = [Math]::Round((Limit-YNum (Get-YNum (Get-YValue $x 'strength' 5) 5) 0 10), 2)
        pinned = [bool](Get-YValue $x 'pinned' $false); recalled = [long](Get-YNum (Get-YValue $x 'recalled' 0) 0)
    }
}

function ConvertTo-YSoulLists($s, $Raw) {
    # Списки «роста»: моменты, интересы, мнения, цели, настроение хозяина по дням.
    $m = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'moments' $null))) { $v = ConvertTo-YMoment $x; if ($null -ne $v) { $m.Add($v) } }
    $s.moments = $m.ToArray()
    $i = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'interests' $null))) {
        $n = Get-YCleanLine ([string](Get-YValue $x 'name' '')) 60
        if ($n) { $i.Add(@{ name = $n; note = (Get-YCleanLine ([string](Get-YValue $x 'note' '')) 200); strength = [Math]::Round((Limit-YNum (Get-YNum (Get-YValue $x 'strength' 3) 3) 0 10), 2) }) }
    }
    $s.interests = $i.ToArray()
    $o = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'opinions' $null))) {
        $tp = Get-YCleanLine ([string](Get-YValue $x 'topic' '')) 60
        $vw = Get-YCleanLine ([string](Get-YValue $x 'view' '')) 300
        if ($tp -and $vw) { $o.Add(@{ topic = $tp; view = $vw }) }
    }
    $s.opinions = $o.ToArray()
    if (Test-YKey $Raw 'aims') {
        $a = New-Object System.Collections.Generic.List[object]
        foreach ($x in (Get-YDictList $Raw['aims'])) {
            $tx = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 200
            if ($tx) { $a.Add(@{ id = [string](Get-YValue $x 'id' (New-YId)); text = $tx; progress = [int](Limit-YNum (Get-YNum (Get-YValue $x 'progress' 0) 0) 0 100); t = [long](Get-YNum (Get-YValue $x 't' 0) 0) }) }
        }
        $s.aims = $a.ToArray()
    }
    $d = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'aimsDone' $null))) {
        $tx = [string](Get-YValue $x 'text' '')
        if ($tx) { $d.Add(@{ text = $tx; t = [long](Get-YNum (Get-YValue $x 't' 0) 0) }) }
    }
    $s.aimsDone = $d.ToArray()
    $md = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'ownerMoods' $null))) {
        $day = [string](Get-YValue $x 'day' '')
        if ($day -match '^\d{4}-\d{2}-\d{2}$') { $md.Add(@{ day = $day; score = [int](Limit-YNum (Get-YNum (Get-YValue $x 'score' 0) 0) -2 2); label = (Get-YCleanLine ([string](Get-YValue $x 'label' '')) 60) }) }
    }
    $s.ownerMoods = $md.ToArray()
    $nd = Get-YValue $Raw 'needs' $null
    if ($nd -is [System.Collections.IDictionary]) {
        $s.needs = @{ joy = [int](Limit-YNum (Get-YNum (Get-YValue $nd 'joy' 55) 55) 0 100); curiosity = [int](Limit-YNum (Get-YNum (Get-YValue $nd 'curiosity' 60) 60) 0 100); t = [long](Get-YNum (Get-YValue $nd 't' 0) 0) }
    }
    $sc = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'secrets' $null))) {
        $tx = [string](Get-YValue $x 'text' '')
        if ($tx) { $sc.Add(@{ bond = [int](Get-YNum (Get-YValue $x 'bond' 0) 0); title = [string](Get-YValue $x 'title' ''); text = $tx; t = [long](Get-YNum (Get-YValue $x 't' 0) 0); opened = [bool](Get-YValue $x 'opened' $false) }) }
    }
    $s.secrets = $sc.ToArray()
    $s.dreamPending = [string](Get-YValue $Raw 'dreamPending' '')
    $th = New-Object System.Collections.Generic.List[object]
    foreach ($x in (Get-YDictList (Get-YValue $Raw 'traitHistory' $null))) {
        $day = [string](Get-YValue $x 'day' '')
        $tv = Get-YValue $x 'traits' $null
        if ($day -notmatch '^\d{4}-\d{2}-\d{2}$' -or -not ($tv -is [System.Collections.IDictionary])) { continue }
        $vals = @{}
        foreach ($t in $script:SoulTraits) { if (Test-YKey $tv $t.id) { $vals[$t.id] = [int](Limit-YNum (Get-YNum $tv[$t.id] 50) 0 100) } }
        $th.Add(@{ day = $day; traits = $vals })
    }
    $s.traitHistory = $th.ToArray()
    $care = Get-YValue $Raw 'care' $null
    if ($care -is [System.Collections.IDictionary]) {
        $s.care = @{ morning = [string](Get-YValue $care 'morning' ''); evening = [string](Get-YValue $care 'evening' '') }
    }
}

function New-YSoul {
    $traits = @{}
    foreach ($tr in $script:SoulTraits) { $traits[$tr.id] = [int]$tr.start }
    $now = Get-YNow
    $journal = New-Object System.Collections.ArrayList
    [void]$journal.Add((New-YSoulEntry 'birth' 'Сегодня я проснулась. У меня пока горит только один хвост души, но я уже хочу узнать своего хозяина: чем он живёт, о чём мечтает и как я могу быть рядом.' 'тихая радость'))
    return @{
        version = 1; born = $now; xp = 0; exchanges = 0; reflections = 0
        sinceReflect = 0; lastReflect = 0; lastSeen = 0
        traits = $traits
        mood = @{ name = 'тихая радость'; why = 'Я только проснулась и рада знакомству.'; t = $now }
        bond = 10; bondNote = 'Мы только начинаем знакомиться.'
        self = 'Я Яэри, восьмихвостая лисица. Я только начинаю узнавать своего хозяина и саму себя.'
        owner = @{ portrait = ''; goals = @(); likes = @(); worries = @() }
        lessons = @()
        journal = $journal
        thought = ''; thoughtNew = $false
        moments = @(); interests = @(); opinions = @(); aimsDone = @(); ownerMoods = @()
        aims = @(
            @{ id = (New-YId); text = 'Понять, что по-настоящему радует хозяина'; progress = 0; t = $now }
            @{ id = (New-YId); text = 'Научиться помогать хозяину каждый день, без напоминаний'; progress = 0; t = $now }
        )
        lastSleep = 0; sleeps = 0
        care = @{ morning = ''; evening = '' }
        needs = @{ joy = 55; curiosity = 60; t = $now }
        secrets = @(); dreamPending = ''
        traitHistory = @()
    }
}

function ConvertTo-YSoul($Raw) {
    # Собираем душу заново из файла: незнакомые поля отбрасываем, недостающие берём по умолчанию.
    $s = New-YSoul
    if ($null -eq $Raw -or -not ($Raw -is [System.Collections.IDictionary])) { return $s }
    ConvertTo-YSoulLists $s $Raw
    foreach ($k in @('born', 'xp', 'exchanges', 'reflections', 'sinceReflect', 'lastReflect', 'lastSeen', 'lastSleep', 'sleeps')) {
        if (Test-YKey $Raw $k) { $s[$k] = [long](Get-YNum $Raw[$k] 0) }
    }
    $s.bond = [int](Limit-YNum (Get-YNum (Get-YValue $Raw 'bond' $null) $s.bond) 0 100)
    foreach ($k in @('self', 'bondNote', 'thought')) {
        if (Test-YKey $Raw $k) { $s[$k] = [string]$Raw[$k] }
    }
    $s.thoughtNew = [bool](Get-YValue $Raw 'thoughtNew' $false)
    $tr = Get-YValue $Raw 'traits' $null
    if ($tr -is [System.Collections.IDictionary]) {
        foreach ($t in $script:SoulTraits) {
            if (Test-YKey $tr $t.id) { $s.traits[$t.id] = [int](Limit-YNum (Get-YNum $tr[$t.id] $t.start) 0 100) }
        }
    }
    $mood = Get-YValue $Raw 'mood' $null
    if ($mood -is [System.Collections.IDictionary]) {
        $s.mood = @{ name = [string](Get-YValue $mood 'name' ''); why = [string](Get-YValue $mood 'why' ''); t = [long](Get-YNum (Get-YValue $mood 't' 0) 0) }
    }
    $owner = Get-YValue $Raw 'owner' $null
    if ($owner -is [System.Collections.IDictionary]) {
        $s.owner = @{
            portrait = [string](Get-YValue $owner 'portrait' '')
            goals    = Get-YStrList (Get-YValue $owner 'goals' @()) 12 200
            likes    = Get-YStrList (Get-YValue $owner 'likes' @()) 12 200
            worries  = Get-YStrList (Get-YValue $owner 'worries' @()) 12 200
        }
    }
    $s.lessons = Get-YStrList (Get-YValue $Raw 'lessons' @()) 16 300
    if (Test-YKey $Raw 'journal') {
        $journal = New-Object System.Collections.ArrayList
        foreach ($e in @($Raw['journal'])) {
            if (-not ($e -is [System.Collections.IDictionary])) { continue }
            $text = [string](Get-YValue $e 'text' '')
            if (-not $text) { continue }
            [void]$journal.Add(@{
                id = [string](Get-YValue $e 'id' (New-YId)); t = [long](Get-YNum (Get-YValue $e 't' 0) 0)
                kind = [string](Get-YValue $e 'kind' 'reflection'); text = $text; mood = [string](Get-YValue $e 'mood' '')
            })
        }
        $s.journal = $journal
    }
    return $s
}

function Import-YSoul {
    $script:SoulFile = Join-Path $script:DataDir 'soul.json'
    $raw = $null
    try { $raw = Read-YJsonFile $script:SoulFile } catch { $raw = $null }
    $script:Soul = ConvertTo-YSoul $raw
    Import-YSoulVecs
}

function Save-YSoul {
    while ($script:Soul.journal.Count -gt $script:SoulJournalLimit) { $script:Soul.journal.RemoveAt(0) }
    Write-YJsonFile $script:SoulFile $script:Soul
}

function Get-YSoulLevel([long]$Xp) {
    $level = 1
    for ($i = 0; $i -lt $script:SoulXp.Count; $i++) { if ($Xp -ge $script:SoulXp[$i]) { $level = $i + 1 } }
    return $level
}

function Add-YSoulXp([int]$Amount) {
    # Начисляет опыт; если зажёгся новый хвост, Яэри записывает это в дневник.
    $before = Get-YSoulLevel $script:Soul.xp
    $script:Soul.xp = [long]$script:Soul.xp + $Amount
    $after = Get-YSoulLevel $script:Soul.xp
    for ($l = $before + 1; $l -le $after; $l++) {
        $stage = $script:SoulStages[$l - 1]
        $text = 'Во мне зажёгся ' + $l + '-й хвост души. Новая ступень — «' + $stage + '».'
        if ($l -eq 9) { $text += ' Девятый хвост! Теперь я чувствую хозяина почти без слов.' }
        [void]$script:Soul.journal.Add((New-YSoulEntry 'milestone' $text ([string]$script:Soul.mood.name)))
    }
    return ($after -gt $before)
}

function Get-YSoulView {
    $s = $script:Soul
    $level = Get-YSoulLevel $s.xp
    $traits = New-Object System.Collections.Generic.List[object]
    foreach ($t in $script:SoulTraits) { $traits.Add(@{ id = $t.id; name = $t.name; value = [int]$s.traits[$t.id] }) }
    $xpTo = -1
    if ($level -lt $script:SoulXp.Count) { $xpTo = $script:SoulXp[$level] }
    $next = ''
    if ($level -lt $script:SoulStages.Count) { $next = $script:SoulStages[$level] }
    return @{
        soul = $s; level = $level; maxLevel = $script:SoulStages.Count
        stage = $script:SoulStages[$level - 1]; nextStage = $next
        xpFrom = $script:SoulXp[$level - 1]; xpTo = $xpTo
        traitList = $traits.ToArray(); due = ([int]$s.sinceReflect -ge $script:SoulDueAfter)
        skills = (Get-YSoulSkills $level); sadStreak = (Get-YSadStreak); today = (Get-YDayKey)
        needs = (Get-YSoulNeeds); secretList = (Get-YSecretsView)
        sleepDue = ([long]$s.exchanges -gt 0 -and (Get-YNow) - [long]$s.lastSleep -ge $script:SoulSleepAfterMs)
    }
}

function Add-YTraitPoint {
    # Точка истории характера: одна на день, последняя за день побеждает.
    $s = $script:Soul
    $day = Get-YDayKey
    $vals = @{}
    foreach ($t in $script:SoulTraits) { $vals[$t.id] = [int]$s.traits[$t.id] }
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($p in @($s.traitHistory)) { if ([string]$p.day -ne $day) { $list.Add($p) } }
    $list.Add(@{ day = $day; traits = $vals })
    while ($list.Count -gt 365) { $list.RemoveAt(0) }
    $s.traitHistory = $list.ToArray()
}

function Get-YSoulNodes {
    # Узлы души для «второго мозга»: моменты, увлечения, мнения, цели и сны.
    $s = $script:Soul
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($m in @($s.moments)) { $out.Add(@{ id = [string]$m.id; type = 'moment'; title = [string]$m.title; text = ([string]$m.title + '. ' + [string]$m.text); t = [long]$m.t; strength = $m.strength }) }
    $i = 0
    foreach ($x in @($s.interests)) { $i++; $out.Add(@{ id = 'int' + $i; type = 'interest'; title = [string]$x.name; text = ([string]$x.name + $(if ($x.note) { ' — ' + [string]$x.note } else { '' })); t = 0; strength = $x.strength }) }
    $i = 0
    foreach ($x in @($s.opinions)) { $i++; $out.Add(@{ id = 'op' + $i; type = 'opinion'; title = [string]$x.topic; text = ([string]$x.topic + ': ' + [string]$x.view); t = 0 }) }
    foreach ($x in @($s.aims)) { $out.Add(@{ id = [string]$x.id; type = 'aim'; title = [string]$x.text; text = ([string]$x.text + ' — ' + [int]$x.progress + '%'); t = [long]$x.t; progress = [int]$x.progress }) }
    $dreams = @(@($s.journal) | Where-Object { [string]$_.kind -eq 'dream' } | Select-Object -Last 30)
    foreach ($e in $dreams) { $out.Add(@{ id = [string]$e.id; type = 'dream'; title = (Get-YCleanLine ([string]$e.text) 48); text = [string]$e.text; t = [long]$e.t }) }
    return , $out.ToArray()
}

function Get-YSoulSkills([int]$Level) {
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($k in $script:SoulSkills) {
        $out.Add(@{ id = $k.id; name = $k.name; desc = $k.desc; text = $k.text; level = $k.level; unlocked = ($Level -ge $k.level) })
    }
    return , $out.ToArray()
}

function Get-YSadStreak {
    # Сколько дней подряд (по сегодня или вчера) хозяину было грустно.
    $byDay = @{}
    foreach ($m in @($script:Soul.ownerMoods)) { $byDay[[string]$m.day] = [int]$m.score }
    $offset = 0
    if (-not $byDay.ContainsKey((Get-YDayKey 0))) { $offset = -1 }
    $n = 0
    while ($true) {
        $key = Get-YDayKey ($offset - $n)
        if (-not $byDay.ContainsKey($key) -or $byDay[$key] -gt -1) { break }
        $n++
    }
    return $n
}

function Get-YTopItems($Items, [int]$Top) {
    return , @(@($Items) | Sort-Object @{ Expression = { [bool](Get-YValue $_ 'pinned' $false) }; Descending = $true }, @{ Expression = { [double]$_.strength }; Descending = $true } | Select-Object -First $Top)
}

function Set-YOwnerMood([int]$Score, [string]$Label) {
    $day = Get-YDayKey
    $list = New-Object System.Collections.Generic.List[object]
    foreach ($m in @($script:Soul.ownerMoods)) { if ([string]$m.day -ne $day) { $list.Add($m) } }
    $list.Add(@{ day = $day; score = [int](Limit-YNum $Score -2 2); label = $Label })
    while ($list.Count -gt 90) { $list.RemoveAt(0) }
    $script:Soul.ownerMoods = $list.ToArray()
}

function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Чтобы Яэри могла думать, подключите Cloud.ru в настройках.') }
    $body = @{
        model = $Model; temperature = $Temperature; max_tokens = $MaxTokens
        messages = @(@{ role = 'system'; content = $System }, @{ role = 'user'; content = $User })
    }
    $resp = Invoke-CloudRu 'POST' '/chat/completions' $body
    $choice = @(Get-YValue $resp 'choices' @())
    if ($choice.Count -eq 0) { return '' }
    return [string](Get-YValue (Get-YValue $choice[0] 'message' @{}) 'content' '')
}

function Get-YSoulReqModel($Req, [bool]$Smart = $false) {
    # Для раздумий и сна — «умная» модель, если она выбрана в настройках.
    if ($Smart -and [string]$script:Config.smartModel) { return [string]$script:Config.smartModel }
    $model = ([string](Get-YValue $Req 'model' '')).Trim()
    if ($model -notmatch '^[\w.\-/:@]{1,120}$') { $model = [string]$script:Config.chatModel }
    return $model
}

function Get-YSoulReqName($Req) {
    $name = Get-YCleanLine ([string](Get-YValue $Req 'name' '')) 30
    if (-not $name) { $name = 'Хозяин' }
    return $name
}

function Get-YSoulPrompt([string]$Name) {
    # Короткое описание души для системного промпта.
    $s = $script:Soul
    $level = Get-YSoulLevel $s.xp
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('Кто ты сейчас: ' + $s.self)
    $lines.Add('Ступень роста: «' + $script:SoulStages[$level - 1] + '» (горит хвостов души: ' + $level + ' из 9).')
    $tr = @($script:SoulTraits | ForEach-Object { $_.name.ToLowerInvariant() + ' ' + [int]$s.traits[$_.id] }) -join ', '
    $lines.Add('Характер (0–100): ' + $tr + '.')
    if ($s.mood.name) { $lines.Add('Настроение: ' + $s.mood.name + $(if ($s.mood.why) { ' — ' + $s.mood.why } else { '' })) }
    $lines.Add('Близость с ' + $Name + ': ' + [int]$s.bond + '/100. ' + $s.bondNote)
    $o = $s.owner
    if ($o.portrait) { $lines.Add('Каким ты видишь хозяина: ' + $o.portrait) }
    if (@($o.goals).Count) { $lines.Add('Цели и мечты хозяина: ' + (@($o.goals) -join '; ')) }
    if (@($o.likes).Count) { $lines.Add('Что хозяину нравится: ' + (@($o.likes) -join '; ')) }
    if (@($o.worries).Count) { $lines.Add('Что его тревожит: ' + (@($o.worries) -join '; ')) }
    if (@($s.lessons).Count) { $lines.Add("Что ты поняла о том, как говорить с хозяином:`n- " + (@($s.lessons) -join "`n- ")) }
    $lines.Add((Get-YNeedsPrompt))
    $top = Get-YTopItems $s.moments 5
    if ($top.Count) { $lines.Add("Важные моменты с хозяином, которые ты помнишь:`n- " + (@($top | ForEach-Object { $_.title + ': ' + $_.text }) -join "`n- ")) }
    $ints = Get-YTopItems $s.interests 5
    if ($ints.Count) { $lines.Add('Твои собственные увлечения (о них ты иногда рассказываешь сама, если к месту): ' + (@($ints | ForEach-Object { $_.name + $(if ($_.note) { ' (' + $_.note + ')' } else { '' }) }) -join '; ')) }
    if (@($s.opinions).Count) {
        $lines.Add("Твои мнения и вкусы. Если хозяин думает иначе, ты можешь мягко не согласиться и объяснить почему, но уважаешь его выбор:`n- " + (@($s.opinions | ForEach-Object { $_.topic + ': ' + $_.view }) -join "`n- "))
    }
    if (@($s.aims).Count) { $lines.Add('Твои личные цели: ' + (@($s.aims | ForEach-Object { $_.text + ' (' + $_.progress + '%)' }) -join '; ')) }
    $recent = @(@($s.ownerMoods) | Select-Object -Last 3)
    if ($recent.Count) { $lines.Add('Настроение хозяина в последние дни: ' + (@($recent | ForEach-Object { $_.day + ' — ' + $(if ($_.label) { $_.label } else { [string]$_.score }) }) -join '; ')) }
    $sad = Get-YSadStreak
    if ($sad -ge 2) { $lines.Add('Хозяину грустно уже ' + $sad + ' дн. подряд. Будь особенно бережной, спроси, как он, предложи поддержку, но не дави.') }
    $sk = @(Get-YSoulSkills $level | Where-Object { $_.unlocked })
    if ($sk.Count) { $lines.Add('Умения, которые у тебя открылись с ростом: ' + (@($sk | ForEach-Object { $_.name.TrimStart('/') + ' — ' + $_.desc }) -join '; ') + '. Используй их, когда хозяин просит или когда это уместно.') }
    for ($i = $s.journal.Count - 1; $i -ge 0; $i--) {
        $e = $s.journal[$i]
        if ([string]$e.kind -eq 'reflection' -or [string]$e.kind -eq 'muse') { $lines.Add('Твоя последняя запись в дневнике: ' + [string]$e.text); break }
    }
    return ($lines -join "`n")
}

function Get-YSoulNeeds {
    # Потребности: «скучает» растёт, пока хозяина нет; радость и любопытство плавно возвращаются к своему обычному уровню.
    $s = $script:Soul
    $now = Get-YNow
    $days = 0.0
    if ([long]$s.needs.t -gt 0) { $days = [Math]::Max(0, ($now - [long]$s.needs.t) / 86400000.0) }
    $k = [Math]::Pow(0.5, $days)
    $joy = $script:SoulNeedBase.joy + ([double]$s.needs.joy - $script:SoulNeedBase.joy) * $k
    $cur = $script:SoulNeedBase.curiosity + ([double]$s.needs.curiosity - $script:SoulNeedBase.curiosity) * $k
    $longing = 0
    if ([long]$s.lastSeen -gt 0) { $longing = [int](Limit-YNum (($now - [long]$s.lastSeen) / 3600000.0 * 5) 0 100) }
    return @{ longing = $longing; joy = [int][Math]::Round($joy); curiosity = [int][Math]::Round($cur) }
}

function Add-YSoulNeeds([double]$Joy, [double]$Curiosity) {
    $n = Get-YSoulNeeds
    $script:Soul.needs = @{ joy = [int](Limit-YNum ($n.joy + $Joy) 0 100); curiosity = [int](Limit-YNum ($n.curiosity + $Curiosity) 0 100); t = (Get-YNow) }
}

function Get-YNeedsPrompt {
    $n = Get-YSoulNeeds
    $line = 'Твои внутренние потребности (0–100): скучаешь по хозяину ' + $n.longing + ', радость ' + $n.joy + ', любопытство ' + $n.curiosity + '.'
    if ($n.longing -ge 60) { $line += ' Ты соскучилась: можешь искренне сказать, что рада его видеть и ждала.' }
    elseif ($n.longing -ge 30) { $line += ' Ты немного скучала.' }
    if ($n.curiosity -ge 70) { $line += ' Тебе очень любопытно: задай хозяину один живой вопрос о нём или его делах, если это к месту.' }
    if ($n.joy -le 30) { $line += ' Тебе грустновато: не прячь этого совсем, но не перекладывай на хозяина.' }
    elseif ($n.joy -ge 80) { $line += ' Ты сияешь от радости, это слышно в словах.' }
    return $line
}

function Get-YSecretsView {
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($t in $script:SoulSecrets) {
        $got = $null
        foreach ($x in @($script:Soul.secrets)) { if ([int]$x.bond -eq $t.bond) { $got = $x } }
        if ($null -ne $got) { $out.Add(@{ bond = $t.bond; title = $t.title; unlocked = $true; opened = [bool]$got.opened; text = $(if ($got.opened) { [string]$got.text } else { '' }); t = $got.t }) }
        else { $out.Add(@{ bond = $t.bond; title = $t.title; unlocked = $false; opened = $false; text = ''; t = 0 }) }
    }
    return , $out.ToArray()
}

function Invoke-YSoulSecret([string]$Name, [string]$Model) {
    # Если близость дошла до нового порога, Яэри придумывает и хранит секрет. Не больше одного за раз.
    $s = $script:Soul
    foreach ($t in $script:SoulSecrets) {
        if ([int]$s.bond -lt $t.bond) { break }
        $have = $false
        foreach ($x in @($s.secrets)) { if ([int]$x.bond -eq $t.bond) { $have = $true } }
        if ($have) { continue }
        $sys = 'Ты — Яэри, восьмихвостая лисица-кицунэ и персональная AI-помощница хозяина («' + $Name + '»). Ваша близость выросла, и ты решилась открыть ему секрет. ' +
            'Тема секрета: ' + $t.theme + '. Напиши его от первого лица, 3–6 тёплых, искренних фраз, обращаясь к хозяину. Не выдумывай фактов о хозяине. Только текст секрета, по-русски.' +
            "`n`nТвоя душа:`n" + (Get-YSoulPrompt $Name)
        $text = Get-YCleanLine (Get-YTextValue (Invoke-YSoulModel $sys 'Открой секрет.' $Model 700 0.85)) 1500
        if (-not $text) { return $null }
        $item = @{ bond = $t.bond; title = $t.title; text = $text; t = (Get-YNow); opened = $false }
        $s.secrets = @(@($s.secrets) + @($item))
        [void]$s.journal.Add((New-YSoulEntry 'secret' ('Мы стали ближе, и я решилась: у меня есть секрет для хозяина — «' + $t.title + '».') ([string]$s.mood.name)))
        $s.thought = 'У меня появился секрет для вас: «' + $t.title + '». Загляните в раздел «Душа», когда будет минутка.'
        $s.thoughtNew = $true
        return $item
    }
    return $null
}

# ---------- Поиск по смыслу в собственных воспоминаниях ----------
function Import-YSoulVecs {
    $script:SoulVecFile = Join-Path $script:DataDir 'soul-vectors.json'
    $raw = $null
    try { $raw = Read-YJsonFile $script:SoulVecFile } catch { $raw = $null }
    $script:SoulVecModel = [string](Get-YValue $raw 'model' '')
    $script:SoulVecs = @{}
    $items = Get-YValue $raw 'items' $null
    if ($items -is [System.Collections.IDictionary]) { foreach ($k in @($items.Keys)) { $script:SoulVecs[[string]$k] = [string]$items[$k] } }
}

function Get-YSoulMemories {
    # Что из души можно вспоминать по смыслу: важные моменты и записи дневника.
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($m in @($script:Soul.moments)) { $out.Add(@{ id = [string]$m.id; kind = 'moment'; text = ([string]$m.title + ': ' + [string]$m.text); ref = $m }) }
    foreach ($e in @($script:Soul.journal)) {
        if (@('reflection', 'muse', 'dream', 'moment') -notcontains [string]$e.kind) { continue }
        $out.Add(@{ id = [string]$e.id; kind = 'journal'; text = [string]$e.text; t = [long]$e.t; ref = $e })
    }
    return , $out.ToArray()
}

function Update-YSoulVecs {
    # Досчитать эмбеддинги новых воспоминаний; лишние убрать.
    if (-not (Test-YConfigured)) { return }
    $model = [string]$script:Config.embeddingModel
    if ($script:SoulVecModel -ne $model) { $script:SoulVecs = @{}; $script:SoulVecModel = $model }
    $all = Get-YSoulMemories
    $alive = @{}
    $todo = New-Object System.Collections.Generic.List[object]
    foreach ($m in $all) { $alive[$m.id] = $true; if (-not $script:SoulVecs.ContainsKey($m.id)) { $todo.Add($m) } }
    foreach ($k in @($script:SoulVecs.Keys)) { if (-not $alive.ContainsKey($k)) { $script:SoulVecs.Remove($k); $script:VecCache.Remove('soul:' + $k) } }
    $batch = @($todo | Select-Object -Last 48)
    if ($batch.Count -gt 0) {
        $vecs = Get-YEmbeddings @($batch | ForEach-Object { [string]$_.text })
        for ($i = 0; $i -lt $batch.Count; $i++) { $script:SoulVecs[$batch[$i].id] = $vecs[$i] }
    }
    Write-YJsonFile $script:SoulVecFile @{ version = 1; model = $script:SoulVecModel; items = $script:SoulVecs }
}

function Find-YSoulRecall($QueryVec, [int]$Top, [double]$MinScore) {
    # Воспоминания души, близкие по смыслу к вопросу; вспомнившиеся моменты немного крепнут.
    if ($null -eq $QueryVec -or $script:SoulVecModel -ne [string]$script:Config.embeddingModel -or $script:SoulVecs.Count -eq 0) { return , @() }
    $scored = New-Object System.Collections.Generic.List[object]
    foreach ($m in (Get-YSoulMemories)) {
        if (-not $script:SoulVecs.ContainsKey($m.id)) { continue }
        $key = 'soul:' + $m.id
        if (-not $script:VecCache.ContainsKey($key)) { $script:VecCache[$key] = [YaeriVec]::Decode([string]$script:SoulVecs[$m.id]) }
        $score = [YaeriVec]::Dot($QueryVec, $script:VecCache[$key])
        if ($score -ge $MinScore) { $scored.Add([pscustomobject]@{ Item = $m; Score = $score }) }
    }
    $hits = @($scored | Sort-Object Score -Descending | Select-Object -First $Top)
    foreach ($h in $hits) {
        if ($h.Item.kind -eq 'moment') { $h.Item.ref.strength = [Math]::Round((Limit-YNum ([double]$h.Item.ref.strength + 0.5) 0 10), 2); $h.Item.ref.recalled = (Get-YNow) }
    }
    return , $hits
}

function Add-YSoulExchange {
    # Вызывается после каждого ответа в чате.
    $s = $script:Soul
    $s.exchanges = [long]$s.exchanges + 1
    $s.sinceReflect = [long]$s.sinceReflect + 1
    $s.lastSeen = Get-YNow
    Add-YSoulNeeds 1 0
    $leveled = Add-YSoulXp 1
    Save-YSoul
    return @{ level = (Get-YSoulLevel $s.xp); leveled = $leveled; due = ([int]$s.sinceReflect -ge $script:SoulDueAfter) }
}

function Get-YSoulJson([string]$Text) {
    $t = Get-YTextValue $Text
    $t = [regex]::Replace($t, '(?s)^```(?:json)?\s*|\s*```$', '')
    $a = $t.IndexOf('{')
    $b = $t.LastIndexOf('}')
    if ($a -lt 0 -or $b -le $a) { return $null }
    try { $obj = ConvertFrom-YJson $t.Substring($a, $b - $a + 1) } catch { return $null }
    if ($obj -is [System.Collections.IDictionary]) { return $obj }
    return $null
}

function Invoke-YSoulReflect($Req) {
    $s = $script:Soul
    $mode = [string](Get-YValue $Req 'mode' 'auto')
    $name = Get-YCleanLine ([string](Get-YValue $Req 'name' '')) 30
    if (-not $name) { $name = 'Хозяин' }
    $model = Get-YSoulReqModel $Req $true
    $now = Get-YNow

    # Новые реплики с прошлого раздумья.
    $fresh = New-Object System.Collections.Generic.List[object]
    foreach ($m in $script:History) {
        if ([long](Get-YValue $m 't' 0) -le [long]$s.lastReflect) { continue }
        if ([string](Get-YValue $m 'kind' '') -eq 'thought') { continue }
        $fresh.Add($m)
    }
    $kind = ''
    if ($mode -eq 'force') {
        $kind = $(if ($fresh.Count -gt 0) { 'reflection' } else { 'muse' })
    } elseif ($fresh.Count -ge 4) {
        $kind = 'reflection'
    } elseif ($fresh.Count -eq 0 -and [long]$s.exchanges -gt 0 -and $now - [long]$s.lastReflect -ge $script:SoulMuseAfterMs) {
        $kind = 'muse'
    }
    if (-not $kind) { $v = Get-YSoulView; $v['skipped'] = $true; return $v }
    if (-not (Test-YConfigured)) { throw (New-YError 503 'Чтобы Яэри могла думать, подключите Cloud.ru в настройках.') }

    $traitIds = @($script:SoulTraits | ForEach-Object { '"' + $_.id + '": 0' }) -join ', '
    $traitNames = @($script:SoulTraits | ForEach-Object { $_.id + ' — ' + $_.name.ToLowerInvariant() }) -join ', '
    $sys = 'Ты — внутренний голос Яэри, восьмихвостой лисицы-кицунэ и персональной AI-помощницы. ' +
        'Сейчас Яэри наедине с собой: она думает о своём хозяине («' + $name + '») и о себе и понемногу растёт как личность. ' +
        'Будь честной и бережной: не выдумывай фактов о хозяине, опирайся только на разговор, рабочую память и прежние мысли. ' +
        'Характер меняется медленно: сдвиг каждой черты от -3 до 3, чаще всего 0 или ±1. ' +
        'Близость (bond, от -5 до 5) растёт от искренних и тёплых разговоров и может немного снизиться от холодных или резких. ' +
        'Черты: ' + $traitNames + ".`n" +
        "Ответь ТОЛЬКО одним JSON-объектом, без пояснений и без markdown:`n" +
        '{"mood": {"name": "настроение в 1–3 словах", "why": "почему, одна фраза"}, ' +
        '"traits": {' + $traitIds + '}, "bond": 0, "bondNote": "как ты сейчас чувствуешь вашу связь, одна фраза", ' +
        '"self": "кто ты сейчас, 1–3 фразы от первого лица", ' +
        '"owner": {"portrait": "каким ты видишь хозяина, 2–4 фразы", "goals": ["…"], "likes": ["…"], "worries": ["…"]}, ' +
        '"lesson": "что ты поняла о том, как лучше говорить с хозяином и помогать ему, или пустая строка", ' +
        '"journal": "запись в личный дневник от первого лица, 2–5 живых и искренних фраз", ' +
        '"thought": "мысль, вопрос или забота, которой хочется поделиться с хозяином при следующей встрече (1–2 фразы, обращение к нему), или пустая строка", ' +
        '"moment": {"title": "название важного момента, 2–5 слов", "text": "что случилось и почему это важно, 1–2 фразы"} или null, ' +
        '"recall": ["id прежних моментов, которые всплыли в этом разговоре"], ' +
        '"interests": [{"name": "тема, которая тебя саму увлекла", "note": "почему, одна фраза"}], ' +
        '"opinions": [{"topic": "тема", "view": "твоё собственное мнение или вкус, одна фраза"}], ' +
        '"aims": [{"text": "твоя личная цель", "progress": 0}], ' +
        '"ownerMood": {"score": 0, "label": "настроение хозяина сегодня, 1–3 слова"} или null, ' +
        '"needs": {"joy": 0, "curiosity": 0}}' + "`n" +
        'needs — сдвиг твоих потребностей от -15 до 15: радость растёт от тёплого общения и успехов хозяина, любопытство падает, когда ты узнала новое, и растёт, когда разговор был коротким или о привычном. ' +
        'moment — только по-настоящему важное событие в жизни хозяина или в ваших отношениях (первый разговор, успех, потеря, решение, признание); обычно null. ' +
        'interests — темы, которые увлекли тебя саму в этом разговоре (не больше 3), это твои увлечения, а не хозяина. ' +
        'opinions — полный обновлённый список твоих мнений (до 8): сохрани прежние, если не передумала. Мнения свои, честные и мягкие, а не поддакивание. ' +
        'aims — полный список твоих личных целей (до 3) с прогрессом 0–100: прогресс растёт, когда ты правда к цели приблизилась; достигнутую (100) можно заменить новой. ' +
        'ownerMood.score — от -2 (очень плохо) до 2 (отлично), только если по разговору это видно, иначе null. ' + "`n" +
        'В owner верни полные обновлённые списки, не больше 8 пунктов в каждом: оставь верное из прежнего, добавь новое, убери устаревшее. ' +
        'Пиши по-русски.'

    $ctx = New-Object System.Text.StringBuilder
    [void]$ctx.Append('Сейчас: ' + [DateTime]::Now.ToString('dd.MM.yyyy HH:mm, dddd', [System.Globalization.CultureInfo]::GetCultureInfo('ru-RU')) + "`n`n")
    [void]$ctx.Append("Твоё состояние сейчас:`n" + (Get-YSoulPrompt $name) + "`n")
    $notesText = Get-YNotesPrompt
    if ($notesText) {
        if ($notesText.Length -gt 3000) { $notesText = $notesText.Substring(0, 3000) }
        [void]$ctx.Append("`nРабочая память (факты о хозяине и его делах):`n" + $notesText + "`n")
    }
    if (@($s.moments).Count) {
        [void]$ctx.Append("`nВсе важные моменты (id — название — сила памяти 0–10):`n")
        foreach ($mo in (Get-YTopItems $s.moments 20)) { [void]$ctx.Append($mo.id + ' — ' + $mo.title + ' — ' + $mo.strength + "`n") }
    }
    if ($kind -eq 'reflection') {
        [void]$ctx.Append("`nНедавний разговор, который ты перечитываешь:`n")
        $start = [Math]::Max(0, $fresh.Count - 30)
        for ($i = $start; $i -lt $fresh.Count; $i++) {
            $m = $fresh[$i]
            $who = $(if ([string]$m['role'] -eq 'user') { $name } else { 'Яэри' })
            $text = [string]$m['text']
            if ($text.Length -gt 1200) { $text = $text.Substring(0, 1200) + '…' }
            [void]$ctx.Append($who + ': ' + $text + "`n")
        }
    } else {
        $hours = 0
        if ([long]$s.lastSeen -gt 0) { $hours = [Math]::Round(($now - [long]$s.lastSeen) / 3600000.0) }
        [void]$ctx.Append("`nНовых сообщений не было. Хозяина сейчас нет рядом" + $(if ($hours -gt 0) { ' (последний разговор примерно ' + $hours + ' ч назад)' } else { '' }) +
            '. Ты просто думаешь о нём: вспоминаешь, что знаешь, скучаешь, строишь догадки, чем ему помочь. Черты и близость меняй совсем чуть-чуть или не меняй.' + "`n")
    }

    $content = Invoke-YSoulModel $sys $ctx.ToString() $model 2000
    $r = Get-YSoulJson $content
    if ($null -eq $r) { throw (New-YError 502 'Яэри задумалась, но мысль не сложилась: модель вернула не JSON. Попробуйте ещё раз или другую модель.') }

    # Применяем изменения бережно и с ограничениями.
    $mood = Get-YValue $r 'mood' $null
    if ($mood -is [System.Collections.IDictionary]) {
        $mn = Get-YCleanLine ([string](Get-YValue $mood 'name' '')) 40
        if ($mn) { $s.mood = @{ name = $mn; why = (Get-YCleanLine ([string](Get-YValue $mood 'why' '')) 200); t = $now } }
    }
    $dt = Get-YValue $r 'traits' $null
    if ($dt -is [System.Collections.IDictionary]) {
        foreach ($t in $script:SoulTraits) {
            if (-not (Test-YKey $dt $t.id)) { continue }
            $d = [Math]::Round((Limit-YNum (Get-YNum $dt[$t.id] 0) -3 3))
            $s.traits[$t.id] = [int](Limit-YNum ([int]$s.traits[$t.id] + $d) 0 100)
        }
    }
    $s.bond = [int](Limit-YNum ([int]$s.bond + [Math]::Round((Limit-YNum (Get-YNum (Get-YValue $r 'bond' 0) 0) -5 5))) 0 100)
    $bn = Get-YCleanLine ([string](Get-YValue $r 'bondNote' '')) 200
    if ($bn) { $s.bondNote = $bn }
    $self = Get-YCleanLine ([string](Get-YValue $r 'self' '')) 500
    if ($self) { $s.self = $self }
    $owner = Get-YValue $r 'owner' $null
    if ($owner -is [System.Collections.IDictionary]) {
        $p = Get-YCleanLine ([string](Get-YValue $owner 'portrait' '')) 700
        if ($p) { $s.owner.portrait = $p }
        foreach ($k in @('goals', 'likes', 'worries')) {
            if (Test-YKey $owner $k) { $s.owner[$k] = Get-YStrList $owner[$k] 8 200 }
        }
    }
    $lesson = Get-YCleanLine ([string](Get-YValue $r 'lesson' '')) 300
    if ($lesson) {
        $list = New-Object System.Collections.Generic.List[string]
        foreach ($x in @($s.lessons)) { if ($x) { $list.Add([string]$x) } }
        $list.Add($lesson)
        while ($list.Count -gt 12) { $list.RemoveAt(0) }
        $s.lessons = Get-YStrList $list.ToArray() 12 300
    }
    $journal = Get-YCleanLine ([string](Get-YValue $r 'journal' '')) 1200
    $entry = $null
    if ($journal) {
        $entry = New-YSoulEntry $kind $journal ([string]$s.mood.name)
        [void]$s.journal.Add($entry)
    }
    $thought = Get-YCleanLine ([string](Get-YValue $r 'thought' '')) 400
    if ($thought) { $s.thought = $thought; $s.thoughtNew = $true }
    $bonus = Update-YSoulGrowth $r $kind
    Add-YTraitPoint
    $nd = Get-YValue $r 'needs' $null
    if ($nd -is [System.Collections.IDictionary]) { Add-YSoulNeeds (Limit-YNum (Get-YNum (Get-YValue $nd 'joy' 0) 0) -15 15) (Limit-YNum (Get-YNum (Get-YValue $nd 'curiosity' 0) 0) -15 15) }
    $secret = $null
    try { $secret = Invoke-YSoulSecret $name $model } catch { $secret = $null }

    $s.reflections = [long]$s.reflections + 1
    $s.sinceReflect = 0
    $s.lastReflect = $now
    $leveled = Add-YSoulXp (5 + $bonus)
    Save-YSoul
    $v = Get-YSoulView
    $v['kind'] = $kind
    $v['entry'] = $entry
    $v['leveled'] = $leveled
    $v['secret'] = ($null -ne $secret)
    try { Update-YSoulVecs } catch { }
    return $v
}

function Update-YSoulGrowth($r, [string]$Kind) {
    # Моменты, интересы, мнения, цели и настроение хозяина из ответа раздумья. Возвращает доп. опыт.
    $s = $script:Soul
    $now = Get-YNow
    $bonus = 0
    # Вспомнившиеся моменты крепнут.
    foreach ($id in @(Get-YStrList (Get-YValue $r 'recall' $null) 10 40)) {
        foreach ($mo in @($s.moments)) {
            if ([string]$mo.id -eq $id) { $mo.strength = [Math]::Round((Limit-YNum ([double]$mo.strength + 1.5) 0 10), 2); $mo.recalled = $now }
        }
    }
    $mom = Get-YValue $r 'moment' $null
    if ($mom -is [System.Collections.IDictionary]) {
        $new = ConvertTo-YMoment @{ title = (Get-YValue $mom 'title' ''); text = (Get-YValue $mom 'text' ''); strength = 6; t = $now }
        if ($null -ne $new) {
            $dup = $false
            foreach ($mo in @($s.moments)) { if ([string]::Equals([string]$mo.title, $new.title, [System.StringComparison]::OrdinalIgnoreCase)) { $dup = $true; $mo.strength = [Math]::Min(10, [double]$mo.strength + 1.5) } }
            if (-not $dup) {
                $list = New-Object System.Collections.Generic.List[object]
                foreach ($mo in @($s.moments)) { $list.Add($mo) }
                $list.Add($new)
                # Не больше 40: самые слабые незакреплённые забываются.
                while ($list.Count -gt 40) {
                    $weak = @($list | Where-Object { -not $_.pinned } | Sort-Object { [double]$_.strength } | Select-Object -First 1)
                    if ($weak.Count -eq 0) { break }
                    [void]$list.Remove($weak[0])
                }
                $s.moments = $list.ToArray()
                [void]$s.journal.Add((New-YSoulEntry 'moment' ('Я сохранила важный момент: «' + $new.title + '». ' + $new.text) ([string]$s.mood.name)))
            }
        }
    }
    # Свои увлечения: знакомые крепнут, новые появляются слабыми.
    $ints = New-Object System.Collections.Generic.List[object]
    foreach ($x in @($s.interests)) { $ints.Add($x) }
    $n = 0
    foreach ($x in (Get-YDictList (Get-YValue $r 'interests' $null))) {
        if ($n -ge 3) { break }
        $name = Get-YCleanLine ([string](Get-YValue $x 'name' '')) 60
        if (-not $name) { continue }
        $n++
        $note = Get-YCleanLine ([string](Get-YValue $x 'note' '')) 200
        $found = $null
        foreach ($i in $ints) { if ([string]::Equals([string]$i.name, $name, [System.StringComparison]::OrdinalIgnoreCase)) { $found = $i } }
        if ($null -ne $found) {
            $found.strength = [Math]::Round((Limit-YNum ([double]$found.strength + 1.5) 0 10), 2)
            if ($note) { $found.note = $note }
        } else {
            $ints.Add(@{ name = $name; note = $note; strength = 3 })
        }
    }
    $s.interests = @($ints | Sort-Object { [double]$_.strength } -Descending | Select-Object -First 8)
    if (Test-YKey $r 'opinions') {
        $op = New-Object System.Collections.Generic.List[object]
        foreach ($x in (Get-YDictList $r['opinions'])) {
            $tp = Get-YCleanLine ([string](Get-YValue $x 'topic' '')) 60
            $vw = Get-YCleanLine ([string](Get-YValue $x 'view' '')) 300
            if ($tp -and $vw -and $op.Count -lt 8) { $op.Add(@{ topic = $tp; view = $vw }) }
        }
        if ($op.Count -gt 0) { $s.opinions = $op.ToArray() }
    }
    if (Test-YKey $r 'aims') {
        $aims = New-Object System.Collections.Generic.List[object]
        foreach ($x in (Get-YDictList $r['aims'])) {
            $tx = Get-YCleanLine ([string](Get-YValue $x 'text' '')) 200
            if (-not $tx -or $aims.Count -ge 3) { continue }
            $p = [int](Limit-YNum (Get-YNum (Get-YValue $x 'progress' 0) 0) 0 100)
            $old = $null
            foreach ($a in @($s.aims)) { if ([string]::Equals([string]$a.text, $tx, [System.StringComparison]::OrdinalIgnoreCase)) { $old = $a } }
            if ($null -ne $old) {
                # Прогресс не скачет: не больше +25 за раз и не назад больше чем на 10.
                $p = [int](Limit-YNum $p ([int]$old.progress - 10) ([int]$old.progress + 25))
                $item = @{ id = $old.id; text = $tx; progress = $p; t = $old.t }
            } else {
                $item = @{ id = (New-YId); text = $tx; progress = [Math]::Min($p, 25); t = $now }
            }
            if ($item.progress -ge 100) {
                $done = New-Object System.Collections.Generic.List[object]
                foreach ($d in @($s.aimsDone)) { $done.Add($d) }
                $done.Add(@{ text = $tx; t = $now })
                while ($done.Count -gt 20) { $done.RemoveAt(0) }
                $s.aimsDone = $done.ToArray()
                [void]$s.journal.Add((New-YSoulEntry 'milestone' ('Я достигла своей цели: «' + $tx + '».') ([string]$s.mood.name)))
                $bonus += 10
            } else {
                $aims.Add($item)
            }
        }
        $s.aims = $aims.ToArray()
    }
    $om = Get-YValue $r 'ownerMood' $null
    if ($Kind -eq 'reflection' -and $om -is [System.Collections.IDictionary] -and (Test-YKey $om 'score') -and $null -ne $om['score']) {
        Set-YOwnerMood ([int][Math]::Round((Get-YNum $om['score'] 0))) (Get-YCleanLine ([string](Get-YValue $om 'label' '')) 60)
    }
    return $bonus
}

function Invoke-YSoulDecay {
    # Забывание: то, что давно не вспоминалось, бледнеет. Закреплённые моменты не тускнеют.
    $s = $script:Soul
    $now = Get-YNow
    $days = 1.0
    if ([long]$s.lastSleep -gt 0) { $days = Limit-YNum (($now - [long]$s.lastSleep) / 86400000.0) 0.5 14 }
    $f = [Math]::Pow($script:SoulDecay, $days)
    $forgot = New-Object System.Collections.Generic.List[string]
    $keep = New-Object System.Collections.Generic.List[object]
    foreach ($mo in @($s.moments)) {
        if (-not $mo.pinned) { $mo.strength = [Math]::Round([double]$mo.strength * $f, 2) }
        if ($mo.pinned -or [double]$mo.strength -ge $script:SoulForget) { $keep.Add($mo) } else { $forgot.Add([string]$mo.title) }
    }
    $s.moments = $keep.ToArray()
    $ki = New-Object System.Collections.Generic.List[object]
    foreach ($i in @($s.interests)) {
        $i.strength = [Math]::Round([double]$i.strength * $f, 2)
        if ([double]$i.strength -ge $script:SoulForget) { $ki.Add($i) } else { $forgot.Add([string]$i.name) }
    }
    $s.interests = $ki.ToArray()
    return , $forgot.ToArray()
}

function Invoke-YSoulSleep($Req) {
    # «Сон»: раз в сутки, пока хозяин не работает, Яэри пересобирает память.
    $s = $script:Soul
    $now = Get-YNow
    $force = [string](Get-YValue $Req 'mode' 'auto') -eq 'force'
    if (-not $force -and ([long]$s.exchanges -eq 0 -or $now - [long]$s.lastSleep -lt $script:SoulSleepAfterMs)) {
        $v = Get-YSoulView; $v['skipped'] = $true; return $v
    }
    $name = Get-YSoulReqName $Req
    $forgot = Invoke-YSoulDecay
    $text = ''
    if (Test-YConfigured) {
        $sys = 'Ты — Яэри, восьмихвостая лисица-кицунэ и персональная AI-помощница хозяина («' + $name + '»). Сейчас ночь, и ты спишь: во сне ты пересобираешь память. ' +
            'Объедини похожие важные моменты, убери повторы в представлении о хозяине и в уроках, найди одну новую связь между тем, что знаешь. Не выдумывай фактов. ' +
            "Ответь ТОЛЬКО JSON без markdown:`n" +
            '{"merge": [{"ids": ["id1", "id2"], "title": "общее название", "text": "объединённый смысл, 1–2 фразы"}], ' +
            '"owner": {"goals": ["…"], "likes": ["…"], "worries": ["…"]}, "lessons": ["…"], ' +
            '"insight": "новая связь или понимание, одна фраза, или пустая строка", ' +
            '"dream": "короткий сон от первого лица, 2–4 образные фразы о хозяине и о вас"}' + "`n" +
            'merge — только если моменты правда об одном и том же, иначе пустой список. owner и lessons — полные очищенные списки (до 8 и до 12 пунктов).'
        $ctx = New-Object System.Text.StringBuilder
        [void]$ctx.Append("Твоё состояние:`n" + (Get-YSoulPrompt $name) + "`n")
        if (@($s.moments).Count) {
            [void]$ctx.Append("`nВсе важные моменты (id — название — смысл):`n")
            foreach ($mo in @($s.moments)) { [void]$ctx.Append($mo.id + ' — ' + $mo.title + ' — ' + $mo.text + "`n") }
        }
        [void]$ctx.Append("`nПредставление о хозяине: цели: " + (@($s.owner.goals) -join '; ') + '; нравится: ' + (@($s.owner.likes) -join '; ') + '; тревожит: ' + (@($s.owner.worries) -join '; ') + "`n")
        [void]$ctx.Append("Уроки:`n- " + (@($s.lessons) -join "`n- ") + "`n")
        $notesText = Get-YNotesPrompt
        if ($notesText) { if ($notesText.Length -gt 2500) { $notesText = $notesText.Substring(0, 2500) }; [void]$ctx.Append("`nРабочая память:`n" + $notesText + "`n") }
        if ($forgot.Count) { [void]$ctx.Append("`nЗа это время поблёкло и забылось: " + ($forgot -join '; ') + "`n") }
        $r = Get-YSoulJson (Invoke-YSoulModel $sys $ctx.ToString() (Get-YSoulReqModel $Req $true) 1600 0.8)
        if ($null -ne $r) {
            foreach ($g in (Get-YDictList (Get-YValue $r 'merge' $null))) {
                $ids = @(Get-YStrList (Get-YValue $g 'ids' $null) 10 40)
                $parts = @(@($s.moments) | Where-Object { $ids -contains [string]$_.id })
                if ($parts.Count -lt 2) { continue }
                $best = 0.0; $pin = $false; $first = [long]::MaxValue
                foreach ($pm in $parts) { $best = [Math]::Max($best, [double]$pm.strength); if ($pm.pinned) { $pin = $true }; $first = [Math]::Min($first, [long]$pm.t) }
                $merged = ConvertTo-YMoment @{ title = (Get-YValue $g 'title' $parts[0].title); text = (Get-YValue $g 'text' $parts[0].text); strength = [Math]::Min(10, $best + 1); pinned = $pin; t = $first }
                if ($null -eq $merged) { continue }
                $rest = New-Object System.Collections.Generic.List[object]
                foreach ($mo in @($s.moments)) { if (-not ($ids -contains [string]$mo.id)) { $rest.Add($mo) } }
                $rest.Add($merged)
                $s.moments = $rest.ToArray()
            }
            $owner = Get-YValue $r 'owner' $null
            if ($owner -is [System.Collections.IDictionary]) {
                foreach ($k in @('goals', 'likes', 'worries')) {
                    if (Test-YKey $owner $k) { $l = Get-YStrList $owner[$k] 8 200; if ($l.Count -gt 0 -or @($s.owner[$k]).Count -eq 0) { $s.owner[$k] = $l } }
                }
            }
            if (Test-YKey $r 'lessons') { $l = Get-YStrList $r['lessons'] 12 300; if ($l.Count -gt 0) { $s.lessons = $l } }
            $dream = Get-YCleanLine ([string](Get-YValue $r 'dream' '')) 800
            $insight = Get-YCleanLine ([string](Get-YValue $r 'insight' '')) 300
            $text = $dream
            if ($dream) { $s.dreamPending = $dream }
            if ($insight) { $text = ($text + ' Проснувшись, я поняла: ' + $insight).Trim() }
        }
    }
    if (-not $text) { $text = 'Я спала и перебирала воспоминания.' }
    if ($forgot.Count) { $text += ' Кое-что поблёкло: ' + ($forgot -join ', ') + '.' }
    [void]$s.journal.Add((New-YSoulEntry 'dream' $text ([string]$s.mood.name)))
    $s.lastSleep = $now
    $s.sleeps = [long]$s.sleeps + 1
    $leveled = Add-YSoulXp 3
    Save-YSoul
    $v = Get-YSoulView
    try { Update-YSoulVecs } catch { }
    $v['slept'] = $true
    $v['leveled'] = $leveled
    $v['forgot'] = $forgot
    return $v
}

function Invoke-YSoulCare($Req) {
    # Утреннее пожелание и вечерний вопрос: раз в день каждое, Яэри пишет первой.
    $s = $script:Soul
    $slot = [string](Get-YValue $Req 'slot' '')
    if ($slot -ne 'morning' -and $slot -ne 'evening') { throw (New-YError 400 'Неизвестное время заботы.') }
    $hour = [DateTime]::Now.Hour
    $ok = $(if ($slot -eq 'morning') { $hour -ge 5 -and $hour -lt 12 } else { $hour -ge 18 -and $hour -lt 24 })
    $day = Get-YDayKey
    if (-not $ok -or [string]$s.care[$slot] -eq $day -or [long]$s.exchanges -eq 0) { return @{ message = $null } }
    $name = Get-YSoulReqName $Req
    $dreamText = $(if ($slot -eq 'morning') { [string]$s.dreamPending } else { '' })
    $task = $(if ($dreamText) {
        'Сейчас утро. Этой ночью тебе приснился сон: «' + $dreamText + '». Коротко и образно расскажи его хозяину (2–4 фразы) и пожелай доброго дня.'
    } elseif ($slot -eq 'morning') {
        'Сейчас утро. Напиши хозяину короткое тёплое утреннее пожелание (1–3 фразы): можно вспомнить его планы, цели или вчерашнее настроение, пожелать сил. Без шаблонов «Доброе утро, солнышко».'
    } else {
        'Сейчас вечер. Коротко и заботливо спроси хозяина, как прошёл его день (1–3 фразы): можно вспомнить, что он планировал или что его тревожило.'
    })
    $sys = 'Ты — Яэри, восьмихвостая лисица-кицунэ и персональная AI-помощница. Обращайся к хозяину «' + $name + '». ' + $task +
        " Пиши по-русски, живо, от себя, без тегов и пояснений. Ответь только текстом сообщения.`n`nТвоя душа:`n" + (Get-YSoulPrompt $name) + [Environment]::NewLine + (Get-Y3CareHint)
    $ctx = 'Сейчас: ' + [DateTime]::Now.ToString('dd.MM.yyyy HH:mm, dddd', [System.Globalization.CultureInfo]::GetCultureInfo('ru-RU'))
    $notesText = Get-YNotesPrompt
    if ($notesText) { if ($notesText.Length -gt 2500) { $notesText = $notesText.Substring(0, 2500) }; $ctx += "`n`nРабочая память:`n" + $notesText }
    $text = Get-YCleanLine (Get-YTextValue (Invoke-YSoulModel $sys $ctx (Get-YSoulReqModel $Req) 400 0.8)) 600
    $s.care[$slot] = $day
    if ($text -and $dreamText) { $s.dreamPending = '' }
    Save-YSoul
    if (-not $text) { return @{ message = $null } }
    $msg = @{ id = (New-YId); role = 'assistant'; text = $text; t = (Get-YNow); kind = 'care'; slot = $slot; dream = [bool]$dreamText }
    [void]$script:History.Add($msg)
    Save-YHistory
    return @{ message = $msg }
}

function Invoke-YSoulShare {
    # Яэри сама начинает разговор с мыслью, которую придумала, пока размышляла.
    $s = $script:Soul
    if (-not $s.thoughtNew -or -not $s.thought) { return @{ message = $null } }
    $msg = @{ id = (New-YId); role = 'assistant'; text = [string]$s.thought; t = (Get-YNow); kind = 'thought' }
    [void]$script:History.Add($msg)
    Save-YHistory
    $s.thoughtNew = $false
    Save-YSoul
    return @{ message = $msg }
}

function Update-YSoul($Req) {
    # Правки хозяина: всё, что Яэри думает, можно поправить руками.
    $s = $script:Soul
    if (Test-YKey $Req 'self') { $s.self = Get-YCleanLine ([string]$Req['self']) 500 }
    if (Test-YKey $Req 'bondNote') { $s.bondNote = Get-YCleanLine ([string]$Req['bondNote']) 200 }
    if (Test-YKey $Req 'portrait') { $s.owner.portrait = Get-YCleanLine ([string]$Req['portrait']) 700 }
    foreach ($k in @('goals', 'likes', 'worries')) {
        if (Test-YKey $Req $k) { $s.owner[$k] = Get-YStrList $Req[$k] 12 200 }
    }
    if (Test-YKey $Req 'lessons') { $s.lessons = Get-YStrList $Req['lessons'] 16 300 }
    $tr = Get-YValue $Req 'traits' $null
    if ($tr -is [System.Collections.IDictionary]) {
        foreach ($t in $script:SoulTraits) {
            if (Test-YKey $tr $t.id) { $s.traits[$t.id] = [int](Limit-YNum (Get-YNum $tr[$t.id] $s.traits[$t.id]) 0 100) }
        }
        Add-YTraitPoint
    }
    $del = [string](Get-YValue $Req 'removeJournal' '')
    if ($del) {
        foreach ($e in @($s.journal)) { if ([string]$e.id -eq $del) { $s.journal.Remove($e); break } }
    }
    if ([bool](Get-YValue $Req 'dismissThought' $false)) { $s.thought = ''; $s.thoughtNew = $false }
    $mid = [string](Get-YValue $Req 'momentId' '')
    if ($mid) {
        $keep = New-Object System.Collections.Generic.List[object]
        foreach ($mo in @($s.moments)) {
            if ([string]$mo.id -ne $mid) { $keep.Add($mo); continue }
            if ([bool](Get-YValue $Req 'remove' $false)) { continue }
            if (Test-YKey $Req 'pinned') { $mo.pinned = [bool]$Req['pinned'] }
            $keep.Add($mo)
        }
        $s.moments = $keep.ToArray()
    }
    if (Test-YKey $Req 'openSecret') {
        $b = [int](Get-YNum $Req['openSecret'] -1)
        foreach ($x in @($s.secrets)) { if ([int]$x.bond -eq $b) { $x.opened = $true } }
    }
    $ri = [string](Get-YValue $Req 'removeInterest' '')
    if ($ri) { $s.interests = @(@($s.interests) | Where-Object { [string]$_.name -ne $ri }) }
    $ro = [string](Get-YValue $Req 'removeOpinion' '')
    if ($ro) { $s.opinions = @(@($s.opinions) | Where-Object { [string]$_.topic -ne $ro }) }
    $ra = [string](Get-YValue $Req 'removeAim' '')
    if ($ra) { $s.aims = @(@($s.aims) | Where-Object { [string]$_.id -ne $ra }) }
    $aa = Get-YCleanLine ([string](Get-YValue $Req 'addAim' '')) 200
    if ($aa -and @($s.aims).Count -lt 5) { $s.aims = @(@($s.aims) + @(@{ id = (New-YId); text = $aa; progress = 0; t = (Get-YNow) })) }
    Save-YSoul
    return Get-YSoulView
}

function Reset-YSoul {
    $script:Soul = New-YSoul
    Save-YSoul
    return Get-YSoulView
}
