#requires -Version 5.1
# Яэри: модуль «Дела» — дела со сроками и приоритетами и заметки. Подключается из yaeri-api.ps1 (dot-source).
# Хранится локально в data\tasks.json. Яэри видит дела в каждом ответе и по просьбе хозяина
# создаёт, закрывает и переносит их тегами <дело …> в конце ответа.

$script:TasksLimit = 2000
$script:TaskTag = '(?is)<(?:дело|task)\b([^>]*?)(?:/>|>(.*?)</(?:дело|task)\s*>)'
$script:TaskNoteTag = '(?is)<(?:заметка|note)\b([^>]*?)(?:/>|>(.*?)</(?:заметка|note)\s*>)'
$script:TaskWeek = @('пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс')
$script:TaskMonthsGen = @('января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря')

function Import-YTasks {
    $script:TasksFile = Join-Path $script:DataDir 'tasks.json'
    $raw = Read-YJsonFile $script:TasksFile
    $script:Tasks = New-Object System.Collections.ArrayList
    foreach ($m in @(Get-YValue $raw 'items' @())) {
        if ($null -eq $m -or -not ($m -is [System.Collections.IDictionary])) { continue }
        if (-not [string](Get-YValue $m 'id' '') -or -not [string](Get-YValue $m 'text' '')) { continue }
        [void]$script:Tasks.Add($m)
    }
}

function Save-YTasks { Write-YJsonFile $script:TasksFile @{ version = 1; items = $script:Tasks.ToArray() } }

function ConvertTo-YTaskDate([string]$Value) {
    # Принимает 2026-11-12 или 12.11.2026, возвращает ГГГГ-ММ-ДД либо пустую строку.
    $v = ([string]$Value).Trim()
    if (-not $v) { return '' }
    $formats = [string[]]@('yyyy-MM-dd', 'dd.MM.yyyy', 'd.M.yyyy')
    $dt = [datetime]::MinValue
    if ([datetime]::TryParseExact($v, $formats, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$dt)) {
        if ($dt.Year -lt 2000 -or $dt.Year -gt 2100) { return '' }
        return $dt.ToString('yyyy-MM-dd')
    }
    return ''
}

function ConvertTo-YTaskTime([string]$Value) {
    $v = ([string]$Value).Trim()
    if ($v -match '^(\d{1,2})[:.](\d{2})$') {
        $h = [int]$Matches[1]; $mi = [int]$Matches[2]
        if ($h -le 23 -and $mi -le 59) { return ('{0:D2}:{1:D2}' -f $h, $mi) }
    }
    return ''
}

function ConvertTo-YTaskPrio([string]$Value) {
    $v = ([string]$Value).Trim().ToLowerInvariant()
    if ($v -match '^(high|высок|важн|срочн|!)') { return 'high' }
    if ($v -match '^(low|низк|потом|не\s*срочн)') { return 'low' }
    return 'normal'
}

function Find-YTask([string]$Id) {
    foreach ($t in $script:Tasks) { if ([string]$t['id'] -eq $Id) { return $t } }
    return $null
}

function Get-YTasksList { return @{ items = $script:Tasks.ToArray() } }

function New-YTaskItem([string]$Kind, [string]$Text, [string]$Due, [string]$Time, [string]$Prio, [string]$Src) {
    $max = $(if ($Kind -eq 'note') { 2000 } else { 300 })
    $text = ([string]$Text).Trim()
    if ($Kind -ne 'note') { $text = Get-YCleanLine $text $max } elseif ($text.Length -gt $max) { $text = $text.Substring(0, $max).Trim() }
    if (-not $text) { return $null }
    if ($script:Tasks.Count -ge $script:TasksLimit) { throw (New-YError 413 'Дел и заметок слишком много: удалите старые.') }
    $now = Get-YNow
    $item = @{
        id = (New-YId); kind = $(if ($Kind -eq 'note') { 'note' } else { 'task' }); text = $text
        due = (ConvertTo-YTaskDate $Due); time = ''; prio = 'normal'; done = $false; doneAt = 0
        t = $now; upd = $now; src = $(if ($Src -eq 'yaeri') { 'yaeri' } else { 'user' })
    }
    if ($item.kind -eq 'task') {
        $item['time'] = $(if ($item.due) { ConvertTo-YTaskTime $Time } else { '' })
        $item['prio'] = ConvertTo-YTaskPrio $Prio
    }
    [void]$script:Tasks.Add($item)
    return $item
}

function Save-YTask($Req) {
    # Создать (без id) или изменить дело/заметку.
    $id = [string](Get-YValue $Req 'id' '')
    if (-not $id) {
        $item = New-YTaskItem ([string](Get-YValue $Req 'kind' 'task')) ([string](Get-YValue $Req 'text' '')) `
            ([string](Get-YValue $Req 'due' '')) ([string](Get-YValue $Req 'time' '')) ([string](Get-YValue $Req 'prio' '')) 'user'
        if ($null -eq $item) { throw (New-YError 400 'Пустое дело.') }
        if ([bool](Get-YValue $Req 'done' $false) -and $item.kind -eq 'task') { $item['done'] = $true; $item['doneAt'] = Get-YNow }
        Save-YTasks
        return @{ item = $item }
    }
    $item = Find-YTask $id
    if ($null -eq $item) { throw (New-YError 404 'Дело не найдено.') }
    $isNote = [string]$item['kind'] -eq 'note'
    if (Test-YKey $Req 'text') {
        $text = ([string]$Req['text']).Trim()
        if ($isNote) { if ($text.Length -gt 2000) { $text = $text.Substring(0, 2000) } } else { $text = Get-YCleanLine $text 300 }
        if (-not $text) { throw (New-YError 400 'Пустое дело.') }
        $item['text'] = $text
    }
    if (Test-YKey $Req 'due') { $item['due'] = ConvertTo-YTaskDate ([string]$Req['due']); if (-not $item['due']) { $item['time'] = '' } }
    if (-not $isNote) {
        if (Test-YKey $Req 'time') { $item['time'] = $(if ($item['due']) { ConvertTo-YTaskTime ([string]$Req['time']) } else { '' }) }
        if (Test-YKey $Req 'prio') { $item['prio'] = ConvertTo-YTaskPrio ([string]$Req['prio']) }
        if (Test-YKey $Req 'done') {
            $done = [bool]$Req['done']
            if ($done -ne [bool]$item['done']) { $item['done'] = $done; $item['doneAt'] = $(if ($done) { Get-YNow } else { 0 }) }
        }
    }
    $item['upd'] = Get-YNow
    Save-YTasks
    return @{ item = $item }
}

function Remove-YTask($Req) {
    $item = Find-YTask ([string](Get-YValue $Req 'id' ''))
    if ($null -eq $item) { throw (New-YError 404 'Дело не найдено.') }
    $script:Tasks.Remove($item)
    Save-YTasks
    return @{ ok = $true }
}

function Format-YTaskDate([string]$Iso) {
    $dt = [datetime]::MinValue
    if (-not [datetime]::TryParseExact($Iso, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$dt)) { return $Iso }
    $wd = $script:TaskWeek[(([int]$dt.DayOfWeek) + 6) % 7]
    return ([string]$dt.Day + ' ' + $script:TaskMonthsGen[$dt.Month - 1] + ' ' + $dt.Year + ', ' + $wd)
}

function Get-YTaskDays($Days) {
    # Дни по производственному календарю приходят со страницы: {d:'2026-11-11', w:'ср', type:'work', name:''}.
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($x in @($Days | Select-Object -First 31)) {
        if ($null -eq $x -or -not ($x -is [System.Collections.IDictionary])) { continue }
        $d = ConvertTo-YTaskDate ([string](Get-YValue $x 'd' ''))
        $type = [string](Get-YValue $x 'type' '')
        if (-not $d -or $type -notmatch '^(work|short|off|hol|move)$') { continue }
        $name = Get-YCleanLine ([string](Get-YValue $x 'name' '')) 40
        $out.Add(@{ d = $d; type = $type; name = $name })
    }
    return $out.ToArray()
}

function Get-YTaskStems([string]$Text) {
    # Грубая основа слова: первые 5 букв, чтобы «отчёт», «отчёта», «отчётом» совпадали.
    $out = New-Object System.Collections.Generic.HashSet[string]
    foreach ($m in [regex]::Matches(([string]$Text).ToLowerInvariant().Replace('ё', 'е'), '[\p{L}\d]{4,}')) {
        $w = $m.Value
        [void]$out.Add($(if ($w.Length -gt 5) { $w.Substring(0, 5) } else { $w }))
    }
    return , $out
}

function Find-YTaskMatches([string]$Query, $Skip, [int]$Top = 5) {
    # Записи из «Дел», похожие на вопрос: заметки и дела, которых нет в основном списке подсказки.
    $q = Get-YTaskStems $Query
    if ($q.Count -eq 0) { return @() }
    $hits = New-Object System.Collections.Generic.List[object]
    foreach ($t in $script:Tasks) {
        if ($Skip.Contains([string]$t['id'])) { continue }
        $words = Get-YTaskStems ([string]$t['text'])
        $score = 0
        foreach ($w in $words) { if ($q.Contains($w)) { $score++ } }
        if ($score -gt 0) { $hits.Add([pscustomobject]@{ Item = $t; Score = $score }) }
    }
    return @($hits | Sort-Object -Property Score -Descending | Select-Object -First $Top | ForEach-Object { $_.Item })
}

function Get-YTasksPrompt($Days, [string]$Today = '', [string]$Query = '') {
    $days = @(Get-YTaskDays $Days)
    if (-not $Today) { $Today = $(if ($days.Count -gt 0) { [string]$days[0].d } else { [datetime]::Now.ToString('yyyy-MM-dd') }) }
    $label = @{ work = 'рабочий'; short = 'рабочий, сокращённый на час'; off = 'выходной'; hol = 'праздник'; move = 'выходной (перенос)' }
    $lines = New-Object System.Collections.Generic.List[string]
    $todayText = 'Сегодня ' + (Format-YTaskDate $Today)
    if ($days.Count -gt 0 -and [string]$days[0].d -eq $Today) { $todayText += ', ' + $label[[string]$days[0].type] + $(if ($days[0].name) { ' (' + $days[0].name + ')' } else { '' }) }
    $lines.Add($todayText + '.')
    if ($days.Count -gt 1) {
        $cal = @($days | Select-Object -Skip 1 | ForEach-Object {
            $p = ([string]$_.d).Split('-')
            $p[2] + '.' + $p[1] + ' ' + $(if ($_.type -eq 'work' -or $_.type -eq 'short') { 'раб' } else { 'вых' })
        })
        $lines.Add('Следующие дни по производственному календарю РФ: ' + ($cal -join '; ') + '.')
    }
    $open = @($script:Tasks | Where-Object { [string]$_['kind'] -ne 'note' -and -not [bool]$_['done'] } |
        Sort-Object @{ Expression = { if ($_['due']) { [string]$_['due'] + ' ' + [string]$_['time'] } else { '9999' } } }, @{ Expression = { switch ([string]$_['prio']) { 'high' { 0 } 'low' { 2 } default { 1 } } } } |
        Select-Object -First 40)
    $prioText = @{ high = 'высокий'; normal = 'обычный'; low = 'низкий' }
    if ($open.Count -gt 0) {
        $lines.Add('Открытые дела:')
        foreach ($t in $open) {
            $s = '- [id ' + [string]$t['id'] + '] «' + [string]$t['text'] + '»'
            if ($t['due']) {
                $s += ' — срок ' + (Format-YTaskDate ([string]$t['due'])) + $(if ($t['time']) { ' ' + [string]$t['time'] } else { '' })
                if ([string]$t['due'] -lt $Today) { $s += ' [ПРОСРОЧЕНО]' } elseif ([string]$t['due'] -eq $Today) { $s += ' [сегодня]' }
            } else { $s += ' — без срока' }
            $p = [string]$t['prio']; if (-not $prioText.ContainsKey($p)) { $p = 'normal' }
            $s += ', приоритет ' + $prioText[$p]
            $lines.Add($s)
        }
    } else { $lines.Add('Открытых дел нет.') }
    $since = (Get-YNow) - 3 * 86400000
    $closed = @($script:Tasks | Where-Object { [string]$_['kind'] -ne 'note' -and [bool]$_['done'] -and [long]$_['doneAt'] -ge $since } | Select-Object -Last 8)
    if ($closed.Count -gt 0) {
        $lines.Add('Недавно выполнены: ' + (@($closed | ForEach-Object { '[id ' + [string]$_['id'] + '] «' + [string]$_['text'] + '»' }) -join '; ') + '.')
    }
    $notes = @($script:Tasks | Where-Object { [string]$_['kind'] -eq 'note' } | Select-Object -Last 15)
    if ($notes.Count -gt 0) {
        $lines.Add('Заметки хозяина:')
        foreach ($n in $notes) {
            $txt = [string]$n['text']
            if ($txt.Length -gt 300) { $txt = $txt.Substring(0, 300) + '…' }
            $lines.Add('- [id ' + [string]$n['id'] + '] ' + ([regex]::Replace($txt, '\s+', ' ')) + $(if ($n['due']) { ' (к ' + (Format-YTaskDate ([string]$n['due'])) + ')' } else { '' }))
        }
    }
    if ($Query) {
        $shown = New-Object System.Collections.Generic.HashSet[string]
        foreach ($x in @($open) + @($closed) + @($notes)) { if ($null -ne $x) { [void]$shown.Add([string]$x['id']) } }
        $related = @(Find-YTaskMatches $Query $shown 5)
        if ($related.Count -gt 0) {
            $lines.Add('Похожие на вопрос записи из «Дел» (старые заметки и дела):')
            foreach ($r in $related) {
                $txt = [regex]::Replace([string]$r['text'], '\s+', ' ')
                if ($txt.Length -gt 300) { $txt = $txt.Substring(0, 300) + '…' }
                $kind = $(if ([string]$r['kind'] -eq 'note') { 'заметка' } elseif ([bool]$r['done']) { 'выполнено' } else { 'дело' })
                $lines.Add('- [id ' + [string]$r['id'] + '] ' + $kind + ': ' + $txt + $(if ($r['due']) { ' (' + (Format-YTaskDate ([string]$r['due'])) + ')' } else { '' }))
            }
        }
    }
    return ($lines -join "`n")
}

function Get-YTasksRules {
    return 'Ты ведёшь дела хозяина в модуле «Дела» и можешь менять их, но только когда хозяин сам об этом просит. ' +
        'Для этого в самом конце ответа добавь теги (хозяин их не видит, не упоминай их): ' +
        '<дело действие="создать" срок="ГГГГ-ММ-ДД" время="ЧЧ:ММ" приоритет="высокий|обычный|низкий">текст дела</дело>; ' +
        '<дело действие="закрыть" id="ID"></дело> — дело выполнено; <дело действие="открыть" id="ID"></дело> — вернуть в работу; ' +
        '<дело действие="перенести" id="ID" срок="ГГГГ-ММ-ДД" время="ЧЧ:ММ"></дело>; <дело действие="изменить" id="ID" приоритет="высокий">новый текст</дело>; ' +
        '<дело действие="удалить" id="ID"></дело> — только если хозяин прямо просит удалить; <заметка срок="ГГГГ-ММ-ДД">текст</заметка> — новая заметка. ' +
        'Срок, время и приоритет необязательны. Даты считай от сегодняшней. «Ближайший рабочий день» и переносы с выходных выбирай по производственному календарю выше. ' +
        'В ответе коротко скажи, что сделала. Дела со сроками оформляй тегом <дело>, а не <память>. ' +
        'Если есть просроченные дела или дела на сегодня и ты ещё не напоминала о них в этом разговоре, мягко напомни одной фразой, если это уместно.'
}

function Get-YTaskAttrs([string]$Text) {
    $a = @{}
    foreach ($m in [regex]::Matches([string]$Text, '(?is)([\w-]+)\s*=\s*["«]([^"»]*)["»]')) {
        $k = $m.Groups[1].Value.ToLowerInvariant()
        switch -regex ($k) {
            '^(действие|action|op)$' { $k = 'op' }
            '^(срок|дата|due|date)$' { $k = 'due' }
            '^(время|time)$' { $k = 'time' }
            '^(приоритет|prio|priority)$' { $k = 'prio' }
            '^(id|ид)$' { $k = 'id' }
        }
        $a[$k] = $m.Groups[2].Value.Trim()
    }
    return $a
}

function Resolve-YTaskRef($Attrs, [string]$Body) {
    $id = [string](Get-YValue $Attrs 'id' '')
    if ($id) {
        $t = Find-YTask $id
        if ($null -ne $t) { return $t }
    }
    # Модель могла назвать дело текстом вместо id: ищем по совпадению.
    $q = (Get-YCleanLine $Body 300).ToLowerInvariant()
    if (-not $q) { return $null }
    foreach ($t in $script:Tasks) { if ([string]$t['kind'] -ne 'note' -and ([string]$t['text']).ToLowerInvariant() -eq $q) { return $t } }
    foreach ($t in $script:Tasks) {
        $tx = ([string]$t['text']).ToLowerInvariant()
        if ([string]$t['kind'] -ne 'note' -and $q.Length -ge 4 -and ($tx.Contains($q) -or $q.Contains($tx))) { return $t }
    }
    return $null
}

function Invoke-YTaskTags([string]$Content) {
    # Применяет теги <дело>/<заметка> из ответа Яэри. Возвращает очищенный текст и список сделанного.
    $acts = New-Object System.Collections.Generic.List[string]
    $changed = $false
    foreach ($tag in [regex]::Matches($Content, $script:TaskTag)) {
        try {
            $attrs = Get-YTaskAttrs $tag.Groups[1].Value
            $body = ([string]$tag.Groups[2].Value).Trim()
            $op = ([string](Get-YValue $attrs 'op' 'создать')).ToLowerInvariant()
            if ($op -match '^(созда|добав|нов|create|add)') {
                $item = New-YTaskItem 'task' $body ([string](Get-YValue $attrs 'due' '')) ([string](Get-YValue $attrs 'time' '')) ([string](Get-YValue $attrs 'prio' '')) 'yaeri'
                if ($null -ne $item) {
                    $changed = $true
                    $acts.Add('новое дело «' + $item.text + '»' + $(if ($item.due) { ' на ' + (Format-YTaskDate $item.due) + $(if ($item.time) { ' ' + $item.time } else { '' }) } else { '' }))
                }
                continue
            }
            $t = Resolve-YTaskRef $attrs $body
            if ($null -eq $t) { continue }
            if ($op -match '^(закры|выполн|готов|done|close|complete)') {
                if (-not [bool]$t['done']) { $t['done'] = $true; $t['doneAt'] = Get-YNow; $t['upd'] = Get-YNow; $changed = $true; $acts.Add('выполнено «' + [string]$t['text'] + '»') }
            } elseif ($op -match '^(откры|верну|reopen|open)') {
                if ([bool]$t['done']) { $t['done'] = $false; $t['doneAt'] = 0; $t['upd'] = Get-YNow; $changed = $true; $acts.Add('снова в работе «' + [string]$t['text'] + '»') }
            } elseif ($op -match '^(перен|сдвин|move|resched)') {
                $due = ConvertTo-YTaskDate ([string](Get-YValue $attrs 'due' ''))
                if ($due) {
                    $t['due'] = $due
                    if (Test-YKey $attrs 'time') { $t['time'] = ConvertTo-YTaskTime ([string]$attrs['time']) }
                    $t['upd'] = Get-YNow; $changed = $true
                    $acts.Add('«' + [string]$t['text'] + '» перенесено на ' + (Format-YTaskDate $due) + $(if ($t['time']) { ' ' + [string]$t['time'] } else { '' }))
                }
            } elseif ($op -match '^(измен|обнов|edit|update)') {
                if ($body -and [string]$attrs['id']) { $t['text'] = $(if ([string]$t['kind'] -eq 'note') { $body } else { Get-YCleanLine $body 300 }) }
                if (Test-YKey $attrs 'prio') { $t['prio'] = ConvertTo-YTaskPrio ([string]$attrs['prio']) }
                if (Test-YKey $attrs 'due') { $t['due'] = ConvertTo-YTaskDate ([string]$attrs['due']) }
                if (Test-YKey $attrs 'time') { $t['time'] = $(if ($t['due']) { ConvertTo-YTaskTime ([string]$attrs['time']) } else { '' }) }
                $t['upd'] = Get-YNow; $changed = $true
                $acts.Add('изменено «' + [string]$t['text'] + '»')
            } elseif ($op -match '^(удал|delete|remove)') {
                $script:Tasks.Remove($t); $changed = $true
                $acts.Add('удалено «' + [string]$t['text'] + '»')
            }
        } catch { }
    }
    foreach ($tag in [regex]::Matches($Content, $script:TaskNoteTag)) {
        try {
            $attrs = Get-YTaskAttrs $tag.Groups[1].Value
            $item = New-YTaskItem 'note' ([string]$tag.Groups[2].Value) ([string](Get-YValue $attrs 'due' '')) '' '' 'yaeri'
            if ($null -ne $item) {
                $changed = $true
                $short = [string]$item.text; if ($short.Length -gt 60) { $short = $short.Substring(0, 60) + '…' }
                $acts.Add('заметка «' + $short + '»')
            }
        } catch { }
    }
    if ($changed) { Save-YTasks }
    $clean = [regex]::Replace($Content, $script:TaskTag, '')
    $clean = [regex]::Replace($clean, $script:TaskNoteTag, '')
    return @{ content = $clean.Trim(); acts = $acts.ToArray(); changed = $changed }
}

# Город для погоды и восхода у часов: data/place.json.
function Get-YPlace {
    $raw = Read-YJsonFile (Join-Path $script:DataDir 'place.json')
    $p = Get-YValue $raw 'place' $null
    if ($null -eq $p) { return @{ place = $null } }
    return @{ place = @{ name = [string](Get-YValue $p 'name' ''); lat = [double](Get-YValue $p 'lat' 0); lon = [double](Get-YValue $p 'lon' 0) } }
}

function Set-YPlace($Req) {
    $lat = 0.0; $lon = 0.0
    $ci = [System.Globalization.CultureInfo]::InvariantCulture
    if (-not [double]::TryParse([string](Get-YValue $Req 'lat' ''), [System.Globalization.NumberStyles]::Float, $ci, [ref]$lat) -or [math]::Abs($lat) -gt 90) { throw (New-YError 400 'Некорректная широта.') }
    if (-not [double]::TryParse([string](Get-YValue $Req 'lon' ''), [System.Globalization.NumberStyles]::Float, $ci, [ref]$lon) -or [math]::Abs($lon) -gt 180) { throw (New-YError 400 'Некорректная долгота.') }
    $name = ([string](Get-YValue $Req 'name' '')).Trim()
    if ($name.Length -gt 60) { $name = $name.Substring(0, 60) }
    $place = @{ name = $name; lat = $lat; lon = $lon }
    Write-YJsonFile (Join-Path $script:DataDir 'place.json') @{ version = 1; place = $place }
    return @{ ok = $true; place = $place }
}
