#requires -Version 5.1
# Soul Understanding: понимание хозяина и самой себя.
#  - карта человека: люди, места, распорядок, проекты, привычки, что выматывает и что помогает (только со слов хозяина);
#  - чтение состояния по сообщению (усталость, спешка, напряжение): локально и без запросов к модели;
#  - вопросы по пробелам в карте: по одному, редко и только когда хозяин не торопится и не расстроен;
#  - оценки ответов (👍/👎): плохо оценённые разбираются в урок-правило;
#  - память по темам: «открыто», «не использовать без запроса», «не запоминать».
# Загружается после yaeri-curiosity.ps1. Данные: data\soul-understanding.json.

$script:UndFile = Join-Path $script:DataDir 'soul-understanding.json'
$script:UndLists = @('map', 'states', 'ratings')
$script:UndMax = @{ map = 300; states = 40; ratings = 300 }
$script:UModes = @('open', 'hold', 'off')
$script:UTurnMs = 120000          # столько длится «разрешение» темы после упоминания хозяином
$script:UGapEveryMs = 3 * 3600000   # вопрос по пробелу не чаще раза в 3 часа
$script:UGapRepeatMs = 24 * 3600000 # об одном и том же разделе не чаще раза в сутки

# Темы: порядок важен, первая подходящая считается основной.
$script:UTopics = @(
    @{ id = 'health';    name = 'Здоровье';   rx = '(?i)здоров|болезн|болит|боле[юте]|врач|лекарств|бессонн|давлени|таблетк|диет|тренировк|самочувств|диагноз|терап|депресс' }
    @{ id = 'money';     name = 'Деньги';     rx = '(?i)деньг|финанс|кредит|долг|ипотек|накоплен|трат[ауы]|бюджет|инвест|зарплат' }
    @{ id = 'family';    name = 'Семья';      rx = '(?i)семь[яеию]|мам[аыуе]\b|пап[аыуе]\b|родител|\bжен[аыуе]\b|\bмуж[а-я]*\b|\bсын[а-я]*\b|доч[ьке]|брат|сестр|бабушк|дедушк|ребён|ребен' }
    @{ id = 'relations'; name = 'Отношения';  rx = '(?i)отношени|подруг|друзь|\bдруг\b|любим|свидани|ссор[аы]|партн[её]р|девушк|парн[яе]\b' }
    @{ id = 'work';      name = 'Работа';     rx = '(?i)работ[аыеуо]|проект|начальник|коллег|клиент|карьер|офис|дедлайн|совещан|бизнес|заказчик' }
    @{ id = 'study';     name = 'Учёба';      rx = '(?i)учёб|учеб|универ|экзамен|\bкурс|студент|школ|диплом|лекци' }
    @{ id = 'creative';  name = 'Творчество'; rx = '(?i)рисую|рисова|пишу|музык|гитар|стих|творч|рассказ|книг|фильм|кино|фото|сочиня' }
    @{ id = 'home';      name = 'Быт';        rx = '(?i)квартир|\bбыт\b|уборк|готовл|ремонт|переезд|питомц|кошк|собак|\bдом\b|\bдома\b' }
)
# Чувствительное по умолчанию не используется без прямого упоминания.
$script:UTopicDefaults = @{ health = 'hold'; money = 'hold' }

$script:USections = @(
    @{ id = 'people';    name = 'Люди рядом';          ask = 'Кто для вас самые близкие люди? Мне важно понимать, о ком вы думаете, когда говорите «мои».' }
    @{ id = 'projects';  name = 'Проекты и дела';      ask = 'Чем вы сейчас больше всего заняты? Расскажете про главное дело или проект?' }
    @{ id = 'routine';   name = 'Распорядок дня';      ask = 'Как обычно проходит ваш день? Когда вам проще всего разговаривать и думать?' }
    @{ id = 'habits';    name = 'Привычки и любимое';  ask = 'Что вы любите делать для себя? Какие у вас привычки или маленькие радости?' }
    @{ id = 'places';    name = 'Места';               ask = 'Есть ли места, где вам особенно хорошо? Где вы чаще всего бываете?' }
    @{ id = 'helps';     name = 'Что помогает';        ask = 'Что вам помогает, когда тяжело или нет сил? Хочу знать, как лучше быть рядом.' }
    @{ id = 'stressors'; name = 'Что выматывает';      ask = 'Что вас сильнее всего выматывает в последнее время? Можно коротко.' }
)

$script:UTones = @{
    tired   = @{ label = 'устали';               hint = 'Хозяин, похоже, устал: отвечай короче и мягче, без лишних вопросов (не больше одного), без длинных списков.' }
    hurry   = @{ label = 'торопитесь';           hint = 'Хозяин торопится: сначала сам ответ или результат, очень кратко, без вступлений и встречных вопросов.' }
    tense   = @{ label = 'на нервах';            hint = 'Хозяин напряжён: говори спокойно, без шуток, сначала признай чувства, потом помоги; не дави и не спорь.' }
    sad     = @{ label = 'грустите';             hint = 'Хозяину грустно: будь тёплой, не торопи с советами, сначала выслушай; не заваливай вопросами.' }
    joy     = @{ label = 'в хорошем настроении'; hint = 'Хозяин в хорошем настроении: раздели радость, можно говорить живее и с юмором.' }
    neutral = @{ label = 'спокойны';             hint = '' }
}

function Import-YUnderstanding {
    $raw = $null
    try { $raw = Read-YJsonFile $script:UndFile } catch { $raw = $null }
    $script:Und = @{
        version = 1; topics = @{}; gapAsked = @{}; gapDismissed = @{}
        lastGapAt = 0L; lastRatings = 0L; state = $null
    }
    foreach ($name in $script:UndLists) { $script:Und[$name] = (Get-YEvoArray (Get-YValue $raw $name @())) }
    $script:Und.lastGapAt = [long](Get-YNum (Get-YValue $raw 'lastGapAt' 0) 0)
    $script:Und.lastRatings = [long](Get-YNum (Get-YValue $raw 'lastRatings' 0) 0)
    foreach ($field in @('topics', 'gapAsked', 'gapDismissed')) {
        $src = Get-YValue $raw $field $null
        if ($src -is [System.Collections.IDictionary]) {
            foreach ($k in @($src.Keys)) {
                if ($field -eq 'topics') {
                    if ($script:UModes -contains [string]$src[$k]) { $script:Und.topics[[string]$k] = [string]$src[$k] }
                } elseif ($field -eq 'gapDismissed') {
                    $script:Und.gapDismissed[[string]$k] = [bool]$src[$k]
                } else {
                    $script:Und.gapAsked[[string]$k] = [long](Get-YNum $src[$k] 0)
                }
            }
        }
    }
    $st = Get-YValue $raw 'state' $null
    if ($st -is [System.Collections.IDictionary]) { $script:Und.state = $st }
    $script:UTurn = @{ t = 0L; allowed = @() }
}

function Save-YUnderstanding {
    $plain = @{}
    foreach ($key in @($script:Und.Keys)) {
        if ($script:UndLists -contains [string]$key) {
            $max = [int]$script:UndMax[[string]$key]
            while ($script:Und[$key].Count -gt $max) { $script:Und[$key].RemoveAt(0) }
            $plain[$key] = $script:Und[$key].ToArray()
        } else {
            $plain[$key] = $script:Und[$key]
        }
    }
    Write-YJsonFile $script:UndFile (ConvertTo-YPlain $plain)
}

# ---------- Темы и приватность ----------
function Get-YTopicsOf([string]$Text) {
    $found = New-Object System.Collections.Generic.List[string]
    foreach ($t in $script:UTopics) {
        if ([regex]::IsMatch([string]$Text, [string]$t.rx)) { $found.Add([string]$t.id) }
    }
    return $found.ToArray()
}
function Get-YTopicMode([string]$Id) {
    if ($null -ne $script:Und -and $script:Und.topics.ContainsKey($Id)) { return [string]$script:Und.topics[$Id] }
    if ($script:UTopicDefaults.ContainsKey($Id)) { return [string]$script:UTopicDefaults[$Id] }
    return 'open'
}
# Нельзя запоминать: тема помечена «не запоминать».
function Test-YTopicBlocked([string]$Text) {
    if ($null -eq $script:Und) { return $false }
    foreach ($id in (Get-YTopicsOf $Text)) { if ((Get-YTopicMode $id) -eq 'off') { return $true } }
    return $false
}
# Можно ли показать это модели сейчас: «не использовать без запроса» снимается, если хозяин сам упомянул тему.
function Test-YTopicVisible([string]$Text) {
    if ($null -eq $script:Und) { return $true }
    $allowed = @()
    if ($null -ne $script:UTurn -and (Get-YNow) - [long]$script:UTurn.t -lt $script:UTurnMs) { $allowed = @($script:UTurn.allowed) }
    foreach ($id in (Get-YTopicsOf $Text)) {
        $mode = Get-YTopicMode $id
        if ($mode -eq 'off') { return $false }
        if ($mode -eq 'hold' -and $allowed -notcontains $id) { return $false }
    }
    return $true
}
function Get-YUndPrivList($Items) {
    $out = New-Object System.Collections.Generic.List[string]
    foreach ($x in @($Items)) { if (Test-YTopicVisible ([string]$x)) { $out.Add([string]$x) } }
    return $out.ToArray()
}
function Get-YUndPrivText([string]$Text) {
    if ($null -eq $script:Und -or -not $Text) { return $Text }
    $keep = New-Object System.Collections.Generic.List[string]
    foreach ($part in [regex]::Split($Text, '(?<=[.!?…])\s+')) { if (Test-YTopicVisible $part) { $keep.Add($part) } }
    return ($keep -join ' ')
}

# ---------- Чтение состояния по сообщению ----------
function Get-YUserState([string]$Text) {
    $t = ([string]$Text).Trim()
    $low = $t.ToLowerInvariant()
    $score = @{ tired = 0; hurry = 0; tense = 0; sad = 0; joy = 0 }
    if ($low -match 'устал|вымотан|нет сил|без сил|сонн|не выспал|выгора|засыпаю') { $score.tired += 2 }
    if ($low -match 'срочно|быстрее|быстро|некогда|спешу|тороплюсь|кратко|коротко|в двух словах') { $score.hurry += 2 }
    if ($low -match 'тревож|паник|бесит|злюсь|\bзол\b|достал|ненавижу|ужас|накрыло|переживаю|нервнича|не могу больше') { $score.tense += 2 }
    if ($low -match 'грустн|тоскливо|одинок|плачу|плохо на душе|подавлен|пусто') { $score.sad += 2 }
    if ($low -match '\bура\b|класс|круто|отлично|счастлив|получилось|супер|\bрад\b|\bрада\b') { $score.joy += 2 }
    $letters = [regex]::Matches($t, '\p{L}').Count
    $caps = [regex]::Matches($t, '\p{Lu}').Count
    $excl = [regex]::Matches($t, '!').Count
    if ($letters -ge 12 -and $caps / [double]$letters -gt 0.6) { $score.tense += 1 }
    if ($excl -ge 3) { if ($score.joy -gt 0) { $score.joy += 1 } else { $score.tense += 1 } }
    $tone = 'neutral'
    $best = 0
    foreach ($k in @('tired', 'hurry', 'tense', 'sad', 'joy')) {
        if ($score[$k] -gt $best) { $best = $score[$k]; $tone = $k }
    }
    $energy = 'normal'
    if ($tone -eq 'tired' -or $tone -eq 'sad') { $energy = 'low' } elseif ($tone -eq 'joy' -or $tone -eq 'tense') { $energy = 'high' }
    return @{
        tone = $tone; label = [string]$script:UTones[$tone].label; energy = $energy
        confidence = [Math]::Round([Math]::Min(1.0, $best / 3.0), 2)
        t = (Get-YNow)
    }
}

function Update-YUndTurn([string]$Text) {
    if ($null -eq $script:Und) { return }
    $script:UTurn = @{ t = (Get-YNow); allowed = @(Get-YTopicsOf $Text) }
    $st = Get-YUserState $Text
    $script:Und.state = $st
    [void]$script:Und.states.Add(@{ t = $st.t; tone = $st.tone; confidence = $st.confidence; evidence = (New-YEvidence 'assistant_hypothesis' '' '' ([double]$st.confidence)) })
    Save-YUnderstanding
}

# ---------- Карта человека ----------
function Get-YUndSection([string]$Id) {
    foreach ($s in $script:USections) { if ([string]$s.id -eq $Id) { return $s } }
    return $null
}
function Add-YUndEntry([string]$Section, [string]$Text, [string]$Topic, [string]$Quote, [string]$Source) {
    if ($null -eq (Get-YUndSection $Section)) { return $false }
    $text = Get-YCleanLine $Text 220
    if (-not $text) { return $false }
    if (Test-YTopicBlocked $text) { return $false }
    foreach ($e in $script:Und.map) {
        if ([string]$e.section -eq $Section -and (Get-YEvoNormalized ([string]$e.text)) -eq (Get-YEvoNormalized $text)) { return $false }
    }
    $topicIds = @($script:UTopics | ForEach-Object { [string]$_.id })
    $topic = ([string]$Topic).Trim().ToLowerInvariant()
    if ($topicIds -notcontains $topic) {
        $auto = @(Get-YTopicsOf $text)
        $topic = $(if ($auto.Count) { [string]$auto[0] } else { 'other' })
    }
    if ((Get-YTopicMode $topic) -eq 'off') { return $false }
    [void]$script:Und.map.Add(@{
        id = (New-YId); t = (Get-YNow); section = $Section; text = $text; topic = $topic
        quote = (Get-YCleanLine $Quote 300); source = $Source; evidence = $(if ($Source -eq 'owner') { New-YEvidence 'user_manual' 'user' '' 1 } else { New-YEvidence 'user_quote' $Source $Quote 0 })
    })
    return $true
}
# Запись в карту берётся из того же запроса, что и обычное изучение разговора: только слова самого хозяина.
function Add-YUnderstandingLearning($Item, $Json) {
    if ($null -eq $script:Und -or -not [bool]$script:Evo.enabled) { return }
    $added = 0
    foreach ($x in (Get-YDictList (Get-YValue $Json 'map' @()))) {
        if ($added -ge 4) { break }
        $quote = Get-YCleanLine ([string](Get-YValue $x 'quote' '')) 300
        if (-not (Test-YEvolutionQuote ([string]$Item.user) $quote)) { continue }
        if (Add-YUndEntry ([string](Get-YValue $x 'section' '')) ([string](Get-YValue $x 'text' '')) ([string](Get-YValue $x 'topic' '')) $quote ([string]$Item.id)) { $added++ }
    }
    if ($added -gt 0) {
        Add-YFeed 'map' ('Узнала о вас новое: ' + $added)
        Save-YUnderstanding
        Save-YCuriosity
    }
}
function Get-YMapPrompt {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($s in $script:USections) {
        $items = @($script:Und.map | Where-Object { [string]$_.section -eq [string]$s.id -and (Test-YTopicVisible ([string]$_.text)) } | Select-Object -Last 4)
        if ($items.Count) { $lines.Add([string]$s.name + ': ' + (($items | ForEach-Object { [string]$_.text }) -join '; ')) }
    }
    if ($lines.Count -eq 0) { return '' }
    return 'Карта хозяина (то, что он сам о себе сказал; не пересказывай без повода):' + [Environment]::NewLine + ($lines -join [Environment]::NewLine)
}

# ---------- Вопросы по пробелам ----------
function Get-YUndGaps {
    $gaps = New-Object System.Collections.Generic.List[object]
    foreach ($s in $script:USections) {
        $n = @($script:Und.map | Where-Object { [string]$_.section -eq [string]$s.id }).Count
        if ($n -gt 0) { continue }
        $asked = 0L
        if ($script:Und.gapAsked.ContainsKey([string]$s.id)) { $asked = [long]$script:Und.gapAsked[[string]$s.id] }
        $gaps.Add(@{
            id = [string]$s.id; name = [string]$s.name; ask = [string]$s.ask
            dismissed = ($script:Und.gapDismissed.ContainsKey([string]$s.id) -and [bool]$script:Und.gapDismissed[[string]$s.id])
            askedAt = $asked
        })
    }
    return $gaps.ToArray()
}
function Get-YGapPrompt {
    $st = $script:Und.state
    if ($null -ne $st -and [double]$st.confidence -ge 0.66 -and @('tired', 'hurry', 'tense', 'sad') -contains [string]$st.tone) { return '' }
    $now = Get-YNow
    if ($now - [long]$script:Und.lastGapAt -lt $script:UGapEveryMs) { return '' }
    foreach ($g in (Get-YUndGaps)) {
        if ($g.dismissed -or $now - [long]$g.askedAt -lt $script:UGapRepeatMs) { continue }
        $script:Und.gapAsked[[string]$g.id] = $now
        $script:Und.lastGapAt = $now
        Save-YUnderstanding
        return 'Тебе хочется лучше узнать хозяина. Если сейчас уместно и разговор не о другом, в конце ответа мягко спроси ОДНО (своими словами): ' + [string]$g.ask
    }
    return ''
}

function Get-YUnderstandingPrompt([string]$Text) {
    if ($null -eq $script:Und) { return '' }
    $lines = New-Object System.Collections.Generic.List[string]
    $st = $script:Und.state
    if ($null -ne $st -and [double]$st.confidence -ge 0.66) {
        $hint = [string]$script:UTones[[string]$st.tone].hint
        if ($hint) { $lines.Add($hint + ' (Это грубая оценка по тексту сообщения, она может быть неверной; не говори хозяину, что ты её делала.)') }
    }
    $map = Get-YMapPrompt
    if ($map) { $lines.Add($map) }
    $gap = Get-YGapPrompt
    if ($gap) { $lines.Add($gap) }
    return ($lines -join [Environment]::NewLine)
}

# ---------- Оценки ответов ----------
function Add-YRating($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $score = [int](Get-YNum (Get-YValue $Req 'score' 0) 0)
    if (@(-1, 0, 1) -notcontains $score) { throw (New-YError 400 'Оценка должна быть 1, -1 или 0.') }
    $note = Get-YCleanLine ([string](Get-YValue $Req 'note' '')) 300
    $at = -1
    for ($i = $script:History.Count - 1; $i -ge 0; $i--) {
        if ([string]$script:History[$i]['id'] -eq $id -and [string]$script:History[$i]['role'] -eq 'assistant') { $at = $i; break }
    }
    if ($at -lt 0) { throw (New-YError 404 'Такого ответа нет в истории.') }
    $existing = $null
    foreach ($r in $script:Und.ratings) { if ([string]$r.id -eq $id) { $existing = $r } }
    if ($score -eq 0) {
        if ($null -ne $existing) { $script:Und.ratings.Remove($existing) }
    } else {
        $user = ''
        for ($j = $at - 1; $j -ge 0; $j--) { if ([string]$script:History[$j]['role'] -eq 'user') { $user = [string]$script:History[$j]['text']; break } }
        if ($null -eq $existing) {
            [void]$script:Und.ratings.Add(@{
                id = $id; t = (Get-YNow); score = $score; note = $note; evidence = (New-YEvidence 'user_manual' 'user' '' 1)
                user = (Get-YCleanLine $user 400); reply = (Get-YCleanLine ([string]$script:History[$at]['text']) 500)
                status = $(if ($score -lt 0) { 'new' } else { 'done' })
            })
        } else {
            if ([int]$existing.score -ne $score) { $existing.status = $(if ($score -lt 0) { 'new' } else { 'done' }) }
            $existing.score = $score
            $existing.t = Get-YNow
            if ($note -or $score -gt 0) { $existing.note = $note }
        }
    }
    Save-YUnderstanding
    # Explicit owner ratings adjust bounded source rankings; negative feedback
    # is not evidence that an individual memory is false.
    try {
        Add-YVectorFeedback $id $score (Get-YValue $script:History[$at] 'sources' @())
    } catch { Write-Warning ('Ошибка сохранения оценки Vector 2.0: ' + $_.Exception.Message) }
    return Get-YUnderstandingView
}
function Get-YPendingRatings { return @($script:Und.ratings | Where-Object { [int]$_.score -lt 0 -and [string]$_.status -eq 'new' }) }
function Invoke-YUnderstandingRatings {
    $todo = @(Get-YPendingRatings | Select-Object -First 3)
    if ($todo.Count -eq 0) { return }
    $sys = 'Ты — Яэри и разбираешь ответы, которые хозяин оценил плохо. Для каждого сформулируй ОДИН короткий общий урок-правило на будущее ' +
        '(до 160 символов, например «Когда ..., я ...»). Опирайся только на вопрос, ответ и пояснение хозяина, ничего не выдумывай. ' +
        'Верни только JSON: {"lessons":[{"i":1,"rule":"правило"}]}'
    $lines = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $todo.Count; $i++) {
        $lines.Add([string]($i + 1) + '. Вопрос: ' + [string]$todo[$i].user + ' | Мой ответ: ' + [string]$todo[$i].reply + ' | Пояснение хозяина: ' + $(if ([string]$todo[$i].note) { [string]$todo[$i].note } else { '(нет)' }))
    }
    $json = Get-YSoulJson (Invoke-YSoulModel $sys ($lines -join [Environment]::NewLine) (Get-YSoulReqModel @{} $true) 500 0.2)
    if ($null -eq $json) { throw 'Модель не вернула уроки по оценкам.' }
    $rules = @{}
    foreach ($x in (Get-YDictList (Get-YValue $json 'lessons' @()))) {
        $i = [int](Get-YNum (Get-YValue $x 'i' 0) 0) - 1
        $rule = Get-YCleanLine ([string](Get-YValue $x 'rule' '')) 200
        if ($i -ge 0 -and $i -lt $todo.Count -and $rule) { $rules[$i] = $rule }
    }
    $gained = 0
    for ($i = 0; $i -lt $todo.Count; $i++) {
        $todo[$i].status = 'done'
        if ($rules.ContainsKey($i)) {
            $todo[$i].rule = [string]$rules[$i]
            [void]$script:Cur.lessons.Add(@{
                id = (New-YId); t = (Get-YNow); from = ('rating:' + [string]$todo[$i].id)
                mistake = (Get-YCleanLine ([string]$todo[$i].reply) 200); rule = [string]$rules[$i]
            })
            Add-YFeed 'lesson' ('Урок по вашей оценке: ' + [string]$rules[$i])
            $gained++
        }
    }
    $script:Und.lastRatings = Get-YNow
    Save-YUnderstanding
    Add-YEvolutionEvent 'lesson-review' ('Разобрано плохих оценок: ' + $todo.Count)
    if ($gained -gt 0) { Add-YCurXp (2 * $gained) }
}

# ---------- API ----------
function Get-YDayOf([long]$Ms) { return [DateTimeOffset]::FromUnixTimeMilliseconds($Ms).LocalDateTime.ToString('yyyy-MM-dd') }

function Get-YUnderstandingView {
    $sections = New-Object System.Collections.Generic.List[object]
    foreach ($s in $script:USections) {
        $items = @($script:Und.map | Where-Object { [string]$_.section -eq [string]$s.id } | Select-Object -Last 12 | ForEach-Object {
            @{ id = $_.id; text = $_.text; topic = $_.topic; source = $_.source; t = $_.t; hidden = -not (Test-YTopicVisible ([string]$_.text)) }
        })
        $sections.Add(@{ id = [string]$s.id; name = [string]$s.name; ask = [string]$s.ask; entries = $items })
    }
    $topics = New-Object System.Collections.Generic.List[object]
    $texts = New-Object System.Collections.Generic.List[string]
    foreach ($e in $script:Und.map) { $texts.Add([string]$e.text) }
    foreach ($n in $script:Notes) { $texts.Add([string](Get-YValue $n 'text' '')) }
    foreach ($f in $script:Evo.facts) { $texts.Add([string]$f.key + ' ' + [string]$f.value) }
    foreach ($e in $script:Evo.episodes) { $texts.Add([string]$e.text) }
    $counts = @{}
    foreach ($tx in $texts) { foreach ($id in (Get-YTopicsOf $tx)) { $counts[$id] = [int]$counts[$id] + 1 } }
    foreach ($t in $script:UTopics) {
        $topics.Add(@{ id = [string]$t.id; name = [string]$t.name; mode = (Get-YTopicMode ([string]$t.id)); count = [int]$counts[[string]$t.id] })
    }
    $up = 0; $down = 0; $wUp = 0; $wDown = 0
    $weekAgo = (Get-YNow) - 7 * 86400000L
    $daily = @{}
    foreach ($r in $script:Und.ratings) {
        $day = Get-YDayOf ([long]$r.t)
        if (-not $daily.ContainsKey($day)) { $daily[$day] = @{ day = $day; up = 0; down = 0 } }
        if ([int]$r.score -gt 0) { $up++; $daily[$day].up++; if ([long]$r.t -ge $weekAgo) { $wUp++ } }
        else { $down++; $daily[$day].down++; if ([long]$r.t -ge $weekAgo) { $wDown++ } }
    }
    $series = @($daily.Values | Sort-Object { $_.day } | Select-Object -Last 14)
    $recentDown = @($script:Und.ratings | Where-Object { [int]$_.score -lt 0 } | Select-Object -Last 6 | ForEach-Object {
        @{ id = $_.id; t = $_.t; user = $_.user; reply = $_.reply; note = $_.note; rule = [string]$_.rule; status = $_.status }
    })
    $st = $script:Und.state
    return @{
        sections = $sections.ToArray(); topics = $topics.ToArray(); gaps = @(Get-YUndGaps)
        state = $st; states = @($script:Und.states | Select-Object -Last 14)
        ratings = @{ up = $up; down = $down; weekUp = $wUp; weekDown = $wDown; daily = $series; recentDown = $recentDown }
        total = $script:Und.map.Count
        rated = @($script:Und.ratings | ForEach-Object { @{ id = $_.id; score = $_.score } })
    }
}

function Set-YUndMap($Req) {
    $action = [string](Get-YValue $Req 'action' '')
    if ($action -eq 'add') {
        $ok = Add-YUndEntry ([string](Get-YValue $Req 'section' '')) ([string](Get-YValue $Req 'text' '')) ([string](Get-YValue $Req 'topic' '')) '' 'owner'
        if (-not $ok) { throw (New-YError 400 'Не получилось добавить: пустая запись, дубль, неизвестный раздел или тема помечена «не запоминать».') }
    } elseif ($action -eq 'delete') {
        $id = [string](Get-YValue $Req 'id' '')
        $item = $null
        foreach ($e in $script:Und.map) { if ([string]$e.id -eq $id) { $item = $e } }
        if ($null -eq $item) { throw (New-YError 404 'Такой записи нет.') }
        $script:Und.map.Remove($item)
    } else {
        throw (New-YError 400 'Действие должно быть add или delete.')
    }
    Save-YUnderstanding
    return Get-YUnderstandingView
}

function Set-YUndTopic($Req) {
    $id = [string](Get-YValue $Req 'topic' '')
    $mode = [string](Get-YValue $Req 'mode' '')
    $known = @($script:UTopics | ForEach-Object { [string]$_.id })
    if ($known -notcontains $id) { throw (New-YError 400 'Неизвестная тема.') }
    if ($script:UModes -notcontains $mode) { throw (New-YError 400 'Режим должен быть open, hold или off.') }
    $script:Und.topics[$id] = $mode
    Save-YUnderstanding
    return Get-YUnderstandingView
}

function Set-YUndGap($Req) {
    $id = [string](Get-YValue $Req 'section' '')
    $action = [string](Get-YValue $Req 'action' '')
    if ($null -eq (Get-YUndSection $id)) { throw (New-YError 404 'Такого раздела нет.') }
    switch ($action) {
        'dismiss' { $script:Und.gapDismissed[$id] = $true }
        'restore' { $script:Und.gapDismissed[$id] = $false }
        'ask' {
            $script:Und.gapDismissed[$id] = $false
            $script:Und.gapAsked[$id] = 0L
            $script:Und.lastGapAt = 0L
        }
        default { throw (New-YError 400 'Действие должно быть dismiss, restore или ask.') }
    }
    Save-YUnderstanding
    return Get-YUnderstandingView
}

function Clear-YUnderstanding {
    foreach ($name in $script:UndLists) { $script:Und[$name].Clear() }
    $script:Und.gapAsked = @{}
    $script:Und.gapDismissed = @{}
    $script:Und.lastGapAt = 0L
    $script:Und.state = $null
    Save-YUnderstanding
    return Get-YUnderstandingView
}
