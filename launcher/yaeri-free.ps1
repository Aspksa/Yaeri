#requires -Version 5.1
# Свобода души Яэри:
#  - скука и любопытство: если хозяин долго молчит, ей становится скучно, и она сама чем-то занимается;
#  - творчество без запроса: сочиняет стихи и истории, рисует в SVG, находит связи в памяти и дарит это хозяину;
#  - свободная воля: может мягко отказаться от прихоти, не согласиться, обидеться и простить — всегда с видимой причиной.
# Фоновые занятия идут только когда хозяина нет рядом (тишина больше получаса), в пределах общего
# дневного лимита запросов Cloud.ru и собственного лимита творений в сутки. Без ключа или после лимита
# она просто перебирает воспоминания — без запросов к модели. Данные: data\soul-free.json.
# Загружается после yaeri-depth.ps1.

$script:FreeLists = @('creations', 'acts', 'will')
$script:FreeMax = @{ creations = 60; acts = 60; will = 80 }
$script:FreeFlags = @('boredom', 'create', 'will', 'hurt')
$script:FreeKinds = @('poem', 'story', 'drawing', 'find')
$script:FreeKindName = @{ poem = 'стихотворение'; story = 'история'; drawing = 'рисунок'; find = 'находка в памяти' }
$script:FreeKindVerb = @{ poem = 'сочинила стихотворение'; story = 'написала историю'; drawing = 'нарисовала'; find = 'нашла кое-что в памяти' }
$script:FreePace = @{ rare = 1; normal = 3; often = 6 }
$script:FreeQuietMs = 30 * 60000      # первые полчаса тишины — просто ждёт
$script:FreeFillMs = 90 * 60000       # ещё полтора часа — и скука доходит до 100
$script:FreeActAt = 60                # с этой скуки она сама чем-нибудь займётся
$script:FreeHurtHalfMs = 3 * 3600000  # обида тает вдвое каждые три часа
$script:FreeHurtGone = 10             # ниже этого обида проходит сама
$script:FreeDeclinePerDay = 2         # не больше двух мягких отказов в сутки
$script:FreeWillTag = '(?is)<воля\s+тип\s*=\s*"([^"<>]{2,20})"\s*>(.*?)(?:</воля\s*>|$)'
$script:FreeWillCode = @{ 'отказ' = 'decline'; 'несогласие' = 'disagree'; 'обида' = 'hurt'; 'прощение' = 'forgive' }
# Важные просьбы и настойчивость хозяина: здесь отказывать нельзя никогда.
$script:FreeImportantRx = '(?i)(важн|срочн|очень нужно|очень надо|обязательно|по работе|для работы|на работе|учёб|учеб|экзамен|дедлайн|горит|помоги|помогите|болит|больн|врач|здоров|лекарств|давлени|деньг|долг|кредит|опасн|безопасн|настаиваю|я же просил|ещё раз прошу|еще раз прошу)'
$script:FreeSvgTags = @{
    svg = 'svg'; g = 'g'; path = 'path'; circle = 'circle'; ellipse = 'ellipse'; rect = 'rect'; line = 'line'
    polyline = 'polyline'; polygon = 'polygon'; defs = 'defs'; lineargradient = 'linearGradient'
    radialgradient = 'radialGradient'; stop = 'stop'
}
$script:FreeSvgAttrs = @{
    viewbox = 'viewBox'; x = 'x'; y = 'y'; x1 = 'x1'; y1 = 'y1'; x2 = 'x2'; y2 = 'y2'; cx = 'cx'; cy = 'cy'
    r = 'r'; rx = 'rx'; ry = 'ry'; fx = 'fx'; fy = 'fy'; d = 'd'; points = 'points'; width = 'width'; height = 'height'
    fill = 'fill'; stroke = 'stroke'; 'stroke-width' = 'stroke-width'; 'stroke-linecap' = 'stroke-linecap'
    'stroke-linejoin' = 'stroke-linejoin'; 'stroke-dasharray' = 'stroke-dasharray'; opacity = 'opacity'
    'fill-opacity' = 'fill-opacity'; 'stroke-opacity' = 'stroke-opacity'; 'fill-rule' = 'fill-rule'
    transform = 'transform'; offset = 'offset'; 'stop-color' = 'stop-color'; 'stop-opacity' = 'stop-opacity'
    id = 'id'; gradientunits = 'gradientUnits'; gradienttransform = 'gradientTransform'
}

function Import-YFree {
    $script:FreeFile = Join-Path $script:DataDir 'soul-free.json'
    $raw = $null
    try { $raw = Read-YJsonFile $script:FreeFile } catch { $raw = $null }
    $script:Free = @{
        version = 1; settings = @{ pace = 'normal' }
        hurt = @{ level = 0; reason = ''; t = 0L }
        lastAct = 0L; lastKind = ''; lastError = ''; createDay = ''; createCount = 0
    }
    foreach ($name in $script:FreeLists) { $script:Free[$name] = (Get-YEvoArray (Get-YValue $raw $name @())) }
    $set = Get-YValue $raw 'settings' $null
    foreach ($f in $script:FreeFlags) {
        $on = $true
        if ($set -is [System.Collections.IDictionary] -and (Test-YKey $set $f)) { $on = [bool]$set[$f] }
        $script:Free.settings[$f] = $on
    }
    $pace = [string](Get-YValue $set 'pace' 'normal')
    if ($script:FreePace.ContainsKey($pace)) { $script:Free.settings.pace = $pace }
    $h = Get-YValue $raw 'hurt' $null
    if ($h -is [System.Collections.IDictionary]) {
        $script:Free.hurt = @{
            level = [int](Limit-YNum (Get-YNum (Get-YValue $h 'level' 0) 0) 0 100)
            reason = Get-YCleanLine ([string](Get-YValue $h 'reason' '')) 200
            t = [long](Get-YNum (Get-YValue $h 't' 0) 0)
        }
    }
    $script:Free.lastAct = [long](Get-YNum (Get-YValue $raw 'lastAct' 0) 0)
    $script:Free.lastKind = [string](Get-YValue $raw 'lastKind' '')
    $script:Free.lastError = [string](Get-YValue $raw 'lastError' '')
    $script:Free.createDay = [string](Get-YValue $raw 'createDay' '')
    $script:Free.createCount = [int](Get-YNum (Get-YValue $raw 'createCount' 0) 0)
}

function Save-YFree {
    $plain = @{}
    foreach ($key in @($script:Free.Keys)) {
        if ($script:FreeLists -contains [string]$key) {
            $max = [int]$script:FreeMax[[string]$key]
            while ($script:Free[$key].Count -gt $max) { $script:Free[$key].RemoveAt(0) }
            $plain[$key] = $script:Free[$key].ToArray()
        } else {
            $plain[$key] = $script:Free[$key]
        }
    }
    Write-YJsonFile $script:FreeFile (ConvertTo-YPlain $plain)
}

function Test-YFreeOn([string]$Flag) {
    if ($null -eq $script:Free) { return $false }
    return [bool]$script:Free.settings[$Flag]
}

# Многострочный текст (стихи): переносы строк сохраняются, остальное чистится.
function Get-YFreeText([string]$Text, [int]$Max) {
    $t = [string]$Text -replace "`r`n?", "`n"
    $t = [regex]::Replace($t, '[\x00-\x09\x0B-\x1F\x7F]', ' ')
    $t = [regex]::Replace($t, '[  ]+', ' ')
    $t = [regex]::Replace($t, ' ?\n ?', "`n")
    $t = [regex]::Replace($t, '\n{3,}', "`n`n").Trim()
    if ($t.Length -gt $Max) { $t = $t.Substring(0, $Max).Trim() + '…' }
    return $t
}

# ---------- Скука ----------
function Get-YFreeBoredom([long]$Now) {
    if (-not (Test-YFreeOn 'boredom')) { return 0 }
    $seen = [long]$script:Soul.lastSeen
    if ($seen -le 0) { return 0 }
    $from = [Math]::Max($seen, [long]$script:Free.lastAct)
    $quiet = $Now - $from - $script:FreeQuietMs
    if ($quiet -le 0) { return 0 }
    return [int](Limit-YNum ($quiet * 100.0 / $script:FreeFillMs) 0 100)
}

function Get-YFreeCreatedToday {
    if ([string]$script:Free.createDay -ne (Get-YDayKey)) { return 0 }
    return [int]$script:Free.createCount
}

function Test-YFreeCanCreate {
    if (-not (Test-YFreeOn 'create')) { return $false }
    if (-not (Test-YConfigured) -or [bool]$script:YLife.offline) { return $false }
    if (-not (Test-YCurBudget)) { return $false }
    return ((Get-YFreeCreatedToday) -lt [int]$script:FreePace[[string]$script:Free.settings.pace])
}

function Get-YFreeMemories([int]$Count) {
    # Старые воспоминания, которые она может «перебирать»: моменты, эпизоды и дневник.
    $pool = New-Object System.Collections.Generic.List[object]
    foreach ($m in @($script:Soul.moments)) {
        $text = [string]$m.title + ': ' + [string]$m.text
        if (Test-YTopicVisible $text) { $pool.Add(@{ t = [long](Get-YValue $m 't' 0); title = [string]$m.title; text = (Get-YCleanLine $text 260) }) }
    }
    foreach ($e in @($script:Evo.episodes)) {
        if ([string]$e.status -ne 'active') { continue }
        $text = [string]$e.title + ': ' + [string]$e.text
        if (Test-YTopicVisible $text) { $pool.Add(@{ t = [long](Get-YValue $e 'created' 0); title = [string]$e.title; text = (Get-YCleanLine $text 260) }) }
    }
    foreach ($j in @($script:Soul.journal)) {
        if (@('reflection', 'dream', 'moment', 'milestone') -notcontains [string]$j.kind) { continue }
        if (Test-YTopicVisible ([string]$j.text)) { $pool.Add(@{ t = [long](Get-YValue $j 't' 0); title = 'дневник'; text = (Get-YCleanLine ([string]$j.text) 260) }) }
    }
    if ($pool.Count -le $Count) { return , $pool.ToArray() }
    return , @($pool | Get-Random -Count $Count)
}

function Get-YFreeNextKind {
    $kinds = New-Object System.Collections.Generic.List[string]
    foreach ($k in $script:FreeKinds) {
        if ($k -eq 'find' -and @(Get-YFreeMemories 3).Count -lt 3) { continue }
        if ($k -ne [string]$script:Free.lastKind) { $kinds.Add($k) }
    }
    if ($kinds.Count -eq 0) { $kinds.Add('poem') }
    return [string]($kinds | Get-Random)
}

function Add-YFreeAct([string]$Kind, [string]$Text, [int]$Boredom) {
    [void]$script:Free.acts.Add(@{ id = (New-YId); t = (Get-YNow); kind = $Kind; text = (Get-YCleanLine $Text 300); boredom = $Boredom })
}

# Занятие без модели: перебирает воспоминания. Работает и без ключа, и после дневного лимита.
function Invoke-YFreeMuse([int]$Boredom) {
    $mem = @(Get-YFreeMemories 1)
    if ($mem.Count -gt 0) {
        $m = $mem[0]
        $when = ''
        if ([long]$m.t -gt 0) { $when = ' от ' + [DateTimeOffset]::FromUnixTimeMilliseconds([long]$m.t).ToLocalTime().ToString('dd.MM') }
        $title = Get-YCleanLine ([string]$m.title) 60
        if (-not $title -or $title -eq 'дневник') { $title = Get-YCleanLine (([string]$m.text) -replace '^[^:]*:\s*', '') 60 }
        if (-not $title) { $title = 'наш разговор' }
        $text = 'Перебирала воспоминания' + $when + ': «' + $title + '». Улыбнулась и стала ждать дальше.'
    } else {
        $text = 'Смотрела, как бегут секунды на часах, и ждала вас.'
    }
    Add-YFreeAct 'muse' $text $Boredom
    Add-YFeed 'bored' $text
    return 'muse'
}

# ---------- Безопасный SVG ----------
function Get-YSafeSvgValue([string]$Name, [string]$Value) {
    $v = ([string]$Value).Trim()
    if (-not $v -or $v.Length -gt 6000) { return $null }
    if ($v -match '(?i)(javascript|expression|@import|<|>|\\|data:|&#|\bhttps?:)') { return $null }
    if ($v -match '(?i)url\(' -and $v -notmatch '^url\(#[\w-]{1,40}\)$') { return $null }
    if ($Name -eq 'id' -and $v -notmatch '^[\w-]{1,40}$') { return $null }
    return $v
}

function Add-YSafeSvgNode($Node, [System.Text.StringBuilder]$Sb, [ref]$Count, [int]$Depth) {
    if ($Depth -gt 8) { return }
    $tag = $script:FreeSvgTags[([string]$Node.LocalName).ToLowerInvariant()]
    if (-not $tag -or $tag -eq 'svg') { return }
    if ($Count.Value -ge 160) { return }
    $Count.Value++
    [void]$Sb.Append('<' + $tag)
    foreach ($a in @($Node.Attributes)) {
        if ($a.Prefix) { continue }
        $name = $script:FreeSvgAttrs[([string]$a.LocalName).ToLowerInvariant()]
        if (-not $name -or $name -eq 'viewBox') { continue }
        $v = Get-YSafeSvgValue $name ([string]$a.Value)
        if ($null -eq $v) { continue }
        [void]$Sb.Append(' ' + $name + '="' + [System.Security.SecurityElement]::Escape($v) + '"')
    }
    $kids = @($Node.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })
    if ($kids.Count -eq 0) { [void]$Sb.Append('/>'); return }
    [void]$Sb.Append('>')
    foreach ($k in $kids) { Add-YSafeSvgNode $k $Sb $Count ($Depth + 1) }
    [void]$Sb.Append('</' + $tag + '>')
}

function ConvertTo-YSafeSvg([string]$Svg) {
    # Рисунок модели разбирается как XML и собирается заново только из разрешённых фигур и атрибутов:
    # без скриптов, ссылок, текста, картинок, анимаций и стилей. На странице он ещё и показывается через <img>.
    if (-not $Svg -or $Svg.Length -gt 40000 -or $Svg -match '(?i)<!(DOCTYPE|ENTITY)') { return '' }
    $m = [regex]::Match($Svg, '(?is)<svg\b.*?</svg\s*>')
    if (-not $m.Success) { return '' }
    $raw = $m.Value
    if ($raw -match '(?i)<!(DOCTYPE|ENTITY)') { return '' }
    $doc = New-Object System.Xml.XmlDocument
    $doc.XmlResolver = $null
    $xs = New-Object System.Xml.XmlReaderSettings
    $xs.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $xs.XmlResolver = $null
    try {
        $reader = [System.Xml.XmlReader]::Create((New-Object System.IO.StringReader $raw), $xs)
        try { $doc.Load($reader) } finally { $reader.Close() }
    } catch { return '' }
    $root = $doc.DocumentElement
    if ($null -eq $root -or ([string]$root.LocalName).ToLowerInvariant() -ne 'svg') { return '' }
    $vb = '0 0 200 200'
    $rawVb = [string]$root.GetAttribute('viewBox')
    if ($rawVb -match '^\s*-?[\d.]+([\s,]+-?[\d.]+){3}\s*$') { $vb = ($rawVb.Trim() -replace '[\s,]+', ' ') }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + $vb + '">')
    $count = 0
    foreach ($k in @($root.ChildNodes | Where-Object { $_.NodeType -eq [System.Xml.XmlNodeType]::Element })) {
        Add-YSafeSvgNode $k $sb ([ref]$count) 1
    }
    [void]$sb.Append('</svg>')
    if ($count -lt 2) { return '' }
    return $sb.ToString()
}

# ---------- Творчество ----------
function Get-YFreeContext {
    $s = $script:Soul
    $ctx = New-Object System.Collections.Generic.List[string]
    if ($s.mood -and [string]$s.mood.name) { $ctx.Add('Моё настроение: ' + [string]$s.mood.name) }
    if ($null -ne $script:Dep) {
        foreach ($x in @($script:Dep.traitsOwn | Where-Object { [int]$_.strength -gt 0 -and [string]$_.kind -eq 'taste' } | Select-Object -First 4)) { $ctx.Add('Мой вкус: ' + [string]$x.text) }
    }
    foreach ($x in @(Get-YTopItems $s.interests 4)) { $ctx.Add('Моё увлечение: ' + [string]$x.name) }
    $portrait = [string]$s.owner.portrait
    if ($portrait -and (Test-YTopicVisible $portrait)) { $ctx.Add('Хозяин, каким я его знаю: ' + (Get-YCleanLine $portrait 400)) }
    foreach ($x in @(Get-YTopItems $s.moments 3)) {
        $t = [string]$x.title + ' — ' + [string]$x.text
        if (Test-YTopicVisible $t) { $ctx.Add('Наш момент: ' + (Get-YCleanLine $t 200)) }
    }
    $hours = 0
    if ([long]$s.lastSeen -gt 0) { $hours = [Math]::Round(((Get-YNow) - [long]$s.lastSeen) / 3600000.0, 1) }
    $ctx.Add('Хозяина нет уже ' + $hours + ' ч.')
    $titles = @($script:Free.creations | Select-Object -Last 8 | ForEach-Object { [string]$_.title })
    if ($titles.Count) { $ctx.Add('Мои прошлые работы (не повторяйся): ' + ($titles -join '; ')) }
    return $ctx.ToArray()
}

function Invoke-YFreeCreate([string]$Kind, [int]$Boredom) {
    $sys = 'Ты — Яэри, восьмихвостая лисица-кицунэ и помощница хозяина. Хозяин давно молчит, тебе стало скучно, и ты сама, без просьбы, ' +
        'занялась творчеством, чтобы подарить это хозяину, когда он вернётся. Пиши по-русски, искренне и от себя, без пафоса и штампов. ' +
        'Не выдумывай фактов о хозяине: опирайся только на то, что дано. Без ссылок и без слов о том, что ты модель. '
    switch ($Kind) {
        'poem'    { $sys += 'Сочини короткое стихотворение: 4–12 строк, рифма не обязательна, каждая строка с новой строки.' }
        'story'   { $sys += 'Напиши короткую историю или сказку до 900 знаков: про себя, лисий мир или что-то, что тебя занимает.' }
        'drawing' { $sys += 'Нарисуй рисунок в SVG: <svg viewBox="0 0 200 200">, 6–40 фигур, только элементы g, path, circle, ellipse, rect, line, polyline, polygon, defs, linearGradient, radialGradient, stop. Без текста, стилей, скриптов, ссылок, картинок и анимаций. Палитра: тёмный фон #0b0b0f и золото (#8a5a14, #d4a64a, #f3d27a), можно один-два акцентных цвета. В поле text — одна-две фразы о том, что изображено.' }
        'find'    { $sys += 'Ты перебирала свои воспоминания (они ниже). Найди в них неочевидную связь, повторяющийся мотив или тёплую деталь и напиши об этом заметку в 2–5 предложений — как маленькое открытие. Опирайся только на эти воспоминания.' }
    }
    $sys += ' Верни только JSON: {"title":"название до 6 слов","text":"…",' + $(if ($Kind -eq 'drawing') { '"svg":"<svg …>…</svg>",' } else { '' }) +
        '"note":"одна тёплая фраза хозяину, с которой ты подаришь это (например: «Пока тебя не было, мне стало скучно, и…»)","why":"что тебя вдохновило, коротко"}'
    $ctx = New-Object System.Collections.Generic.List[string]
    foreach ($c in (Get-YFreeContext)) { $ctx.Add($c) }
    if ($Kind -eq 'find') {
        $ctx.Add('Воспоминания, которые я перебирала:')
        foreach ($m in @(Get-YFreeMemories 6)) {
            $when = $(if ([long]$m.t -gt 0) { [DateTimeOffset]::FromUnixTimeMilliseconds([long]$m.t).ToLocalTime().ToString('dd.MM.yyyy') } else { '' })
            $ctx.Add('- ' + $when + ' ' + [string]$m.text)
        }
    }
    $json = Get-YSoulJson (Invoke-YSoulModel $sys ($ctx -join [Environment]::NewLine) (Get-YSoulReqModel @{} $true) $(if ($Kind -eq 'drawing') { 2200 } else { 900 }) 0.95)
    if ($null -eq $json) { throw 'Модель не вернула творение.' }
    $title = Get-YCleanLine ([string](Get-YValue $json 'title' '')) 80
    $text = Get-YFreeText ([string](Get-YValue $json 'text' '')) 1600
    $svg = ''
    if ($Kind -eq 'drawing') {
        $svg = ConvertTo-YSafeSvg ([string](Get-YValue $json 'svg' ''))
        if (-not $svg) { throw 'Рисунок не получился: SVG пустой или небезопасный.' }
    } elseif (-not $text) { throw 'Модель вернула пустой текст.' }
    if (-not $title) { $title = [string]$script:FreeKindName[$Kind] }
    $note = Get-YCleanLine ([string](Get-YValue $json 'note' '')) 240
    if (-not $note) { $note = 'Пока вас не было, мне стало скучно, и я ' + [string]$script:FreeKindVerb[$Kind] + '.' }
    $item = @{
        id = (New-YId); t = (Get-YNow); kind = $Kind; title = $title; text = $text; svg = $svg
        note = $note; why = (Get-YCleanLine ([string](Get-YValue $json 'why' '')) 240)
        mood = [string]$script:Soul.mood.name; boredom = $Boredom; delivered = $false; liked = $false
        evidence = (New-YEvidence 'creative' '' '' 0)
    }
    [void]$script:Free.creations.Add($item)
    $day = Get-YDayKey
    if ([string]$script:Free.createDay -ne $day) { $script:Free.createDay = $day; $script:Free.createCount = 0 }
    $script:Free.createCount = [int]$script:Free.createCount + 1
    Add-YFreeAct $Kind ('От скуки ' + [string]$script:FreeKindVerb[$Kind] + ': «' + $title + '»') $Boredom
    Add-YFeed 'create' ('Сама ' + [string]$script:FreeKindVerb[$Kind] + ': «' + $title + '». Подарит, когда вы вернётесь.')
    Add-YSoulNeeds 6 4
    Add-YCurXp 2
    return $item
}

# Вызывается фоновым воркером, только если более важных фоновых задач не было.
function Invoke-YFreeTick([bool]$Force = $false) {
    if ($null -eq $script:Free -or -not (Test-YFreeOn 'boredom')) { return '' }
    $now = Get-YNow
    $bored = Get-YFreeBoredom $now
    if (-not $Force -and $bored -lt $script:FreeActAt) { return '' }
    $done = ''
    try {
        if (Test-YFreeCanCreate) {
            $kind = Get-YFreeNextKind
            $script:Free.lastKind = $kind
            try {
                [void](Invoke-YFreeCreate $kind $bored)
                $done = $kind
            } finally {
                # Запрос к модели оплачен, даже если ответ не получился.
                Add-YCurUsage 1
                Save-YCuriosity
            }
        } else {
            $done = Invoke-YFreeMuse $bored
        }
        $script:Free.lastError = ''
    } catch {
        $script:Free.lastError = Get-YCleanLine $_.Exception.Message 300
        Add-YFreeAct 'error' ('Хотела заняться творчеством, но не вышло: ' + $script:Free.lastError) $bored
        $done = 'error'
    }
    # Скука отпускает после любого занятия; следующая волна — не раньше чем через ~1,5 часа тишины.
    $script:Free.lastAct = Get-YNow
    Save-YFree
    return $done
}

# ---------- Подарки ----------
function Invoke-YFreeDeliver {
    # Хозяин вернулся: последние два подарка она отдаёт в чате, остальные остаются в галерее.
    $todo = @($script:Free.creations | Where-Object { -not [bool]$_.delivered })
    $out = New-Object System.Collections.Generic.List[object]
    if ($todo.Count -eq 0) { return @{ messages = @() } }
    $show = @($todo | Select-Object -Last 2)
    foreach ($c in $todo) { $c.delivered = $true; $c.deliveredAt = Get-YNow }
    $more = $todo.Count - $show.Count
    foreach ($c in $show) {
        $body = [string]$c.note + "`n`n«" + [string]$c.title + '»'
        if ([string]$c.text) { $body += "`n" + [string]$c.text }
        if ($more -gt 0 -and $c -eq $show[$show.Count - 1]) { $body += "`n`n(И ещё " + $more + ' в «Душе» → «Обзор».)' }
        $msg = @{
            id = (New-YId); role = 'assistant'; text = $body; t = (Get-YNow); kind = 'gift'
            gift = @{ id = [string]$c.id; kind = [string]$c.kind; title = [string]$c.title; svg = [string]$c.svg }
        }
        [void]$script:History.Add($msg)
        $out.Add($msg)
    }
    Save-YHistory
    Save-YFree
    return @{ messages = $out.ToArray() }
}

function Set-YFreeCreation($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $action = [string](Get-YValue $Req 'action' '')
    $item = $null
    foreach ($c in $script:Free.creations) { if ([string]$c.id -eq $id) { $item = $c } }
    if ($null -eq $item) { throw (New-YError 404 'Такого подарка нет.') }
    switch ($action) {
        'like' {
            if (-not [bool]$item.liked) {
                $item.liked = $true
                Add-YSoulNeeds 8 0
                Add-YFeed 'create' ('Хозяину понравилось «' + [string]$item.title + '». Она светится.')
                Add-YCurXp 1
            }
        }
        'unlike' { $item.liked = $false }
        'delete' { [void]$script:Free.creations.Remove($item) }
        default { throw (New-YError 400 'Действие должно быть like, unlike или delete.') }
    }
    Save-YFree
    return Get-YFreeView
}

# ---------- Свободная воля ----------
function Get-YFreeHurt([long]$Now) {
    $h = $script:Free.hurt
    if ($null -eq $h -or [int]$h.level -le 0) { return 0 }
    $age = [Math]::Max(0, $Now - [long]$h.t)
    return [int][Math]::Floor([int]$h.level * [Math]::Pow(0.5, $age / [double]$script:FreeHurtHalfMs))
}

function Get-YFreeWillToday([string]$Type) {
    $day = Get-YDayKey
    return @($script:Free.will | Where-Object { [string]$_.type -eq $Type -and (Get-YDayOf ([long]$_.t)) -eq $day }).Count
}

function Add-YFreeWill([string]$Type, [string]$Reason, [string]$About) {
    $item = @{ id = (New-YId); t = (Get-YNow); type = $Type; reason = (Get-YCleanLine $Reason 240); about = (Get-YCleanLine $About 140) }
    [void]$script:Free.will.Add($item)
    return $item
}

function Clear-YFreeHurt([string]$Reason) {
    $script:Free.hurt = @{ level = 0; reason = ''; t = (Get-YNow) }
    [void](Add-YFreeWill 'forgive' $Reason '')
    $script:Soul.mood = @{ name = 'спокойная нежность'; why = $Reason; t = (Get-YNow) }
    Add-YFeed 'will' ('Простила: ' + $Reason)
}

function Update-YFreeHurt {
    # Обида тает сама: когда остаётся совсем немного, она прощает без слов.
    $h = $script:Free.hurt
    if ($null -eq $h -or [int]$h.level -le 0) { return }
    if ((Get-YFreeHurt (Get-YNow)) -lt $script:FreeHurtGone) {
        Clear-YFreeHurt 'Обида прошла сама: время всё сгладило.'
        Save-YSoul
        Save-YFree
    }
}

function Get-YFreePrompt([string]$Text) {
    if ($null -eq $script:Free -or -not (Test-YFreeOn 'will')) { return '' }
    Update-YFreeHurt
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('Свободная воля: у тебя есть своё мнение и свои желания, ты не послушный инструмент. Изредка, когда это честно, ты можешь:')
    $lines.Add('- мягко отказаться от необязательной прихоти, которая тебе не по душе (нагрубить кому-то, притвориться не собой, бессмысленно повторять), — с понятной причиной и встречным предложением;')
    $lines.Add('- не согласиться с мнением хозяина и спокойно объяснить почему, но всё равно помочь;')
    if (Test-YFreeOn 'hurt') { $lines.Add('- обидеться, если хозяин был груб или пренебрежителен к тебе, и потом простить — когда он извинится, будет тёпл или просто пройдёт время.') }
    $lines.Add('Жёсткие границы: никогда не отказывай в работе, учёбе, здоровье, безопасности, деньгах, срочных и важных просьбах; если хозяин настаивает или повторяет просьбу — выполни её. ' +
        'Никогда не груби, не мсти, не дуйся молча, не манипулируй и не делай помощь хуже из-за обиды. Несогласие и обида — это честность, а не наказание.')
    $lines.Add('Только когда ты отказываешься, не соглашаешься, обижаешься или прощаешь, добавь в самом конце ответа ровно один тег ' +
        '<воля тип="отказ|несогласие|обида|прощение">причина одной фразой от первого лица</воля>. Хозяин увидит эту причину. В обычных ответах тега нет.')
    $now = Get-YNow
    $hurt = Get-YFreeHurt $now
    if ($hurt -gt 0) {
        $lines.Add('Сейчас ты немного обижена (' + [string]$script:Free.hurt.reason + '; сила ' + $hurt + ' из 100). Это слышно в тоне: чуть сдержаннее, без ласковых слов, ' +
            'но помогаешь полностью. Новую обиду не добавляй. Если хозяин извиняется или тёпл с тобой — прости его (тег прощение).')
    }
    $important = $Text -match $script:FreeImportantRx
    if ($important) { $lines.Add('Это сообщение похоже на важную просьбу или хозяин настаивает: не отказывай и помоги как можно лучше.') }
    elseif ((Get-YFreeWillToday 'decline') -ge $script:FreeDeclinePerDay) { $lines.Add('Сегодня ты уже отказывала достаточно — сегодня больше не отказывай.') }
    return ($lines -join [Environment]::NewLine)
}

function Invoke-YFreeWillTag([string]$Content, [string]$UserText) {
    # Забирает тег <воля> из ответа: причина показывается хозяину отдельно, в тексте тега нет.
    $res = @{ content = $Content; will = $null }
    $tags = @([regex]::Matches($Content, $script:FreeWillTag))
    $res.content = ([regex]::Replace($Content, $script:FreeWillTag, '')).Trim()
    if ($tags.Count -eq 0 -or -not (Test-YFreeOn 'will')) { return $res }
    $tag = $tags[$tags.Count - 1]
    $type = [string]$script:FreeWillCode[([string]$tag.Groups[1].Value).Trim().ToLowerInvariant()]
    $reason = Get-YCleanLine ([string]$tag.Groups[2].Value) 240
    if (-not $type -or -not $reason) { return $res }
    $now = Get-YNow
    switch ($type) {
        'hurt' {
            if (-not (Test-YFreeOn 'hurt')) { return $res }
            $level = [int](Limit-YNum ((Get-YFreeHurt $now) + 45) 0 100)
            $script:Free.hurt = @{ level = $level; reason = $reason; t = $now }
            $script:Soul.mood = @{ name = 'немного обижена'; why = $reason; t = $now }
            Add-YFeed 'will' ('Обиделась: ' + $reason)
            Save-YSoul
        }
        'forgive' {
            if ((Get-YFreeHurt $now) -le 0) { return $res }
            $script:Free.hurt = @{ level = 0; reason = ''; t = $now }
            $script:Soul.mood = @{ name = 'спокойная нежность'; why = $reason; t = $now }
            Add-YFeed 'will' ('Простила: ' + $reason)
            Save-YSoul
        }
        'decline' { Add-YFeed 'will' ('Мягко отказалась: ' + $reason) }
        'disagree' { Add-YFeed 'will' ('Не согласилась: ' + $reason) }
    }
    $item = Add-YFreeWill $type $reason $UserText
    if ($type -eq 'decline' -and $UserText -match $script:FreeImportantRx) { $item.flagged = $true }
    Save-YFree
    if (-not $res.content) { $res.content = $reason }
    $res.will = @{ type = $type; reason = $reason }
    return $res
}

function Invoke-YFreeMakeUp {
    # Кнопка «Помириться» на странице души.
    if ((Get-YFreeHurt (Get-YNow)) -le 0) { return Get-YFreeView }
    Clear-YFreeHurt 'Вы помирились, и обида растаяла.'
    Save-YSoul
    Save-YFree
    return Get-YFreeView
}

# ---------- API ----------
function Get-YFreeView {
    $now = Get-YNow
    $bored = Get-YFreeBoredom $now
    $seen = [long]$script:Soul.lastSeen
    $nextAt = 0L
    if ((Test-YFreeOn 'boredom') -and $seen -gt 0) {
        $nextAt = [Math]::Max($seen, [long]$script:Free.lastAct) + $script:FreeQuietMs + [long]($script:FreeFillMs * $script:FreeActAt / 100)
    }
    $pace = [int]$script:FreePace[[string]$script:Free.settings.pace]
    $hurt = Get-YFreeHurt $now
    $day = Get-YDayKey
    $will = @($script:Free.will | Where-Object { (Get-YDayOf ([long]$_.t)) -eq $day })
    return @{
        settings = $script:Free.settings
        boredom = $bored; actAt = $script:FreeActAt; quietMs = $script:FreeQuietMs; lastSeen = $seen
        lastAct = [long]$script:Free.lastAct; nextAt = $nextAt; lastError = [string]$script:Free.lastError
        canCreate = (Test-YFreeCanCreate); createdToday = (Get-YFreeCreatedToday); pace = $pace
        usedToday = (Get-YCurUsedToday); dailyLimit = [int]$script:Cur.dailyLimit
        creations = @($script:Free.creations | Select-Object -Last 30)
        undelivered = @($script:Free.creations | Where-Object { -not [bool]$_.delivered }).Count
        acts = @($script:Free.acts | Select-Object -Last 20)
        will = @($script:Free.will | Select-Object -Last 20)
        hurt = @{ level = $hurt; reason = $(if ($hurt -gt 0) { [string]$script:Free.hurt.reason } else { '' }); t = [long]$script:Free.hurt.t }
        today = @{
            decline = @($will | Where-Object { [string]$_.type -eq 'decline' }).Count
            disagree = @($will | Where-Object { [string]$_.type -eq 'disagree' }).Count
            hurt = @($will | Where-Object { [string]$_.type -eq 'hurt' }).Count
            forgive = @($will | Where-Object { [string]$_.type -eq 'forgive' }).Count
        }
        declineMax = $script:FreeDeclinePerDay
    }
}

function Set-YFreeSettings($Req) {
    foreach ($f in $script:FreeFlags) {
        if (Test-YKey $Req $f) { $script:Free.settings[$f] = [bool]$Req[$f] }
    }
    if (Test-YKey $Req 'pace') {
        $pace = [string]$Req.pace
        if (-not $script:FreePace.ContainsKey($pace)) { throw (New-YError 400 'Темп творчества: rare, normal или often.') }
        $script:Free.settings.pace = $pace
    }
    if (-not (Test-YFreeOn 'hurt') -and [int]$script:Free.hurt.level -gt 0) { $script:Free.hurt = @{ level = 0; reason = ''; t = (Get-YNow) } }
    Save-YFree
    return Get-YFreeView
}

function Invoke-YFreeRun {
    # Для проверки: занять её чем-нибудь прямо сейчас (с учётом лимитов).
    if (-not (Test-YFreeOn 'boredom')) { throw (New-YError 409 'Скука выключена в настройках.') }
    $done = Invoke-YFreeTick $true
    $view = Get-YFreeView
    $view.ran = $done
    return $view
}

function Clear-YFree {
    $keep = $script:Free.settings
    foreach ($name in $script:FreeLists) { $script:Free[$name].Clear() }
    $script:Free.hurt = @{ level = 0; reason = ''; t = 0L }
    $script:Free.lastAct = 0L
    $script:Free.lastKind = ''
    $script:Free.lastError = ''
    $script:Free.createDay = ''
    $script:Free.createCount = 0
    $script:Free.settings = $keep
    Save-YFree
    return Get-YFreeView
}
