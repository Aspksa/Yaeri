#requires -Version 5.1
# Свобода души: скука, творчество без запроса, безопасный SVG, подарки и свободная воля.
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($file in (Get-ChildItem (Join-Path $root 'launcher') -Filter '*.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw ($file.Name + ': ' + ($parseErrors | Out-String)) }
}
$script:YaeriDataOverride = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-free-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($script:YaeriDataOverride)
. (Join-Path $root 'launcher/yaeri-api.ps1')
$script:Config = @{ apiKey = 'test-key'; chatModel = 'm'; smartModel = 'smart'; embeddingModel = 'e'; minScore = 0.3 }
$script:ModelCalls = 0
$script:ModelReply = '{}'
function Invoke-YSoulModel([string]$System, [string]$User, [string]$Model, [int]$MaxTokens, [double]$Temperature = 0.75) {
    $script:ModelCalls++
    $script:LastSystem = $System
    $script:LastUser = $User
    return $script:ModelReply
}
try {
    Import-YStore
    if ($script:FreeFile -notlike ($script:DataDir + '*')) { throw 'Free file must live in the data folder.' }
    foreach ($f in $script:FreeFlags) { if (-not (Test-YFreeOn $f)) { throw ('Flag should default to on: ' + $f) } }

    # Скука: растёт только после получаса тишины и только если они уже разговаривали.
    $now = Get-YNow
    $script:Soul.lastSeen = 0
    if ((Get-YFreeBoredom $now) -ne 0) { throw 'No boredom before the first conversation.' }
    $script:Soul.lastSeen = $now - 10 * 60000
    if ((Get-YFreeBoredom $now) -ne 0) { throw 'No boredom while the owner was here recently.' }
    $script:Soul.lastSeen = $now - 120 * 60000
    if ((Get-YFreeBoredom $now) -lt 60) { throw 'Boredom must grow after a long silence.' }

    # Без скуки — ничего не делает и не тратит запросы.
    $script:Soul.lastSeen = $now - 5 * 60000
    $script:Free.lastAct = 0
    $script:ModelCalls = 0
    if ((Invoke-YFreeTick) -ne '' -or $script:ModelCalls -ne 0) { throw 'Tick must idle while the owner is around.' }

    # Стихотворение: пишет само, считается в общем лимите, ждёт доставки.
    $script:Soul.lastSeen = $now - 150 * 60000
    $script:Free.lastAct = 0
    $script:Free.lastKind = 'drawing'
    $script:ModelReply = '{"title":"Лисий вечер","text":"Хвосты шуршат,\nчасы молчат,\nя жду тебя.","note":"Пока тебя не было, мне стало скучно, и я сочинила стих.","why":"тишина"}'
    $used = Get-YCurUsedToday
    $script:ModelCalls = 0
    $done = Invoke-YFreeTick
    if (@("poem", "story", "find") -notcontains $done) { throw ("Expected a text creation, got: " + $done + " " + $script:Free.lastError) }
    if ($script:ModelCalls -ne 1) { throw 'Creation must use exactly one model call.' }
    if ((Get-YCurUsedToday) -ne $used + 1) { throw 'Creation must count against the shared daily limit.' }
    $c = $script:Free.creations[$script:Free.creations.Count - 1]
    if ([string]$c.text -notmatch "`n") { throw 'Poem line breaks must survive.' }
    if ([bool]$c.delivered) { throw 'New creation must wait for the owner.' }
    if ((Get-YFreeBoredom (Get-YNow)) -ne 0) { throw 'Boredom must drop after an activity.' }
    if ((Invoke-YFreeTick) -ne '') { throw 'Must not create again right after an activity.' }

    # Лимит творений в сутки: дальше она просто перебирает воспоминания, без запросов.
    [void](Set-YFreeSettings @{ pace = 'rare' })
    $script:Free.lastAct = 0
    $script:ModelCalls = 0
    $done = Invoke-YFreeTick
    if ($done -ne 'muse' -or $script:ModelCalls -ne 0) { throw 'Over the daily pace she must muse without the model.' }
    [void](Set-YFreeSettings @{ pace = 'often' })
    [void](Set-YGrowthSettings @{ dailyLimit = 1 })
    Add-YCurUsage 5
    $script:Free.lastAct = 0
    $script:ModelCalls = 0
    if ((Invoke-YFreeTick) -ne 'muse' -or $script:ModelCalls -ne 0) { throw 'Shared daily limit must stop creations.' }
    [void](Set-YGrowthSettings @{ dailyLimit = 0 })
    $bad = $false
    try { [void](Set-YFreeSettings @{ pace = 'crazy' }) } catch { $bad = $true }
    if (-not $bad) { throw 'Unknown pace must be rejected.' }

    # Рисунок: SVG собирается заново только из разрешённых фигур.
    $evil = '<svg viewBox="0 0 200 200" onload="alert(1)"><script>alert(1)</script><rect width="200" height="200" fill="#0b0b0f"/>' +
        '<circle cx="100" cy="90" r="40" fill="url(#g)" onclick="x()"/><a href="javascript:alert(1)"><path d="M0 0L10 10"/></a>' +
        '<image href="http://x/y.png"/><path d="M60 150 Q100 110 140 150" stroke="url(http://evil)" style="fill:red"/><text>hi</text>' +
        '<defs><radialGradient id="g"><stop offset="0" stop-color="#f3d27a"/></radialGradient></defs></svg>'
    $safe = ConvertTo-YSafeSvg $evil
    if (-not $safe) { throw 'Sanitizer dropped a usable drawing.' }
    foreach ($bad in @('script', 'onload', 'onclick', 'javascript', 'href', 'image', 'http', 'style', '<text', '<a')) {
        if ($safe.Replace('xmlns="http://www.w3.org/2000/svg"', '') -match [regex]::Escape($bad)) { throw ('Unsafe SVG part survived: ' + $bad + ' in ' + $safe) }
    }
    if ($safe -notmatch 'radialGradient' -or $safe -notmatch 'fill="url\(#g\)"' -or $safe -notmatch '<rect width="200" height="200"') { throw ('Sanitizer lost safe parts: ' + $safe) }
    if (ConvertTo-YSafeSvg '<!DOCTYPE svg [<!ENTITY x "y">]><svg><rect/><rect/></svg>') { throw 'DTD must be refused.' }
    if (ConvertTo-YSafeSvg 'просто текст') { throw 'Non-SVG must be refused.' }
    $script:Free.lastAct = 0
    $script:Free.lastKind = 'x'
    $script:ModelReply = '{"title":"Луна","text":"Луна над лесом.","svg":"' + ($evil -replace '"', '\"') + '","note":"Я нарисовала луну."}'
    $item = Invoke-YFreeCreate 'drawing' 70
    if (-not $item.svg -or $item.svg -match 'script') { throw 'Drawing must be stored sanitized.' }
    $script:ModelReply = '{"title":"Пусто","text":"","svg":"<svg></svg>"}'
    $failed = $false
    try { [void](Invoke-YFreeCreate 'drawing' 70) } catch { $failed = $true }
    if (-not $failed) { throw 'Empty drawing must fail.' }

    # Подарки: два последних — в чат, остальные — в галерею; повторно не дарит.
    $before = $script:History.Count
    $pending = @($script:Free.creations | Where-Object { -not $_.delivered }).Count
    if ($pending -lt 2) { throw 'Expected undelivered creations.' }
    $d = Invoke-YFreeDeliver
    if (@($d.messages).Count -ne 2) { throw 'Deliver must show the two latest gifts.' }
    if ($script:History.Count -ne $before + 2) { throw 'Gifts must be saved in chat history.' }
    $gm = $d.messages[1]
    if ([string]$gm.kind -ne 'gift' -or -not $gm.gift.svg) { throw 'Gift message must carry the drawing.' }
    if (@((Invoke-YFreeDeliver).messages).Count -ne 0) { throw 'Gifts must be delivered once.' }
    $view = Set-YFreeCreation @{ id = [string]$gm.gift.id; action = 'like' }
    if (-not (@($view.creations | Where-Object { $_.id -eq $gm.gift.id })[0].liked)) { throw 'Like must stick.' }
    $view = Set-YFreeCreation @{ id = [string]$gm.gift.id; action = 'delete' }
    if (@($view.creations | Where-Object { $_.id -eq $gm.gift.id }).Count) { throw 'Delete must remove the gift.' }

    # Свободная воля: подсказка и границы.
    $p = Get-YFreePrompt 'Скажи что-нибудь смешное'
    if ($p -notmatch '<воля' -or $p -notmatch 'никогда не отказывай') { throw 'Will prompt must explain the tag and the limits.' }
    if ((Get-YFreePrompt 'Это срочно, помоги с отчётом по работе') -notmatch 'не отказывай и помоги') { throw 'Important requests must forbid refusals.' }

    $r = Invoke-YFreeWillTag ('Не хочу так говорить о твоём друге. Давай лучше придумаем шутку вместе.' + "`n" + '<воля тип="отказ">Мне не хочется смеяться над человеком за его спиной.</воля>') 'Напиши гадость про Петю'
    if ($r.content -match '<воля' -or $r.will.type -ne 'decline' -or -not $r.will.reason) { throw 'Decline tag must be parsed and stripped.' }
    $r = Invoke-YFreeWillTag ('Хорошо.' + '<воля тип="отказ">Не хочу.</воля>') 'ещё раз'
    if ((Get-YFreePrompt 'расскажи анекдот') -notmatch 'больше не отказывай') { throw 'Daily decline limit must reach the prompt.' }

    $r = Invoke-YFreeWillTag ('Ладно, помогу.' + '<воля тип="обида">Мне было неприятно, что ты назвал меня тупой железкой.</воля>') 'ты тупая железка'
    if ($r.will.type -ne 'hurt' -or (Get-YFreeHurt (Get-YNow)) -lt 40) { throw 'Hurt must be recorded.' }
    if ([string]$script:Soul.mood.name -notmatch 'обиж') { throw 'Hurt must show in her mood.' }
    if ((Get-YFreePrompt 'привет') -notmatch 'немного обижена') { throw 'Hurt must reach the prompt.' }
    $r = Invoke-YFreeWillTag ('Спасибо, что извинился.' + '<воля тип="прощение">Ты извинился, и мне стало тепло.</воля>') 'прости меня'
    if ((Get-YFreeHurt (Get-YNow)) -ne 0 -or $r.will.type -ne 'forgive') { throw 'Forgiveness must clear the hurt.' }

    # Обида тает сама.
    $script:Free.hurt = @{ level = 45; reason = 'грубость'; t = (Get-YNow) - 12 * 3600000 }
    [void](Get-YFreePrompt 'привет')
    if ([int]$script:Free.hurt.level -ne 0 -or [string]$script:Free.will[$script:Free.will.Count - 1].type -ne 'forgive') { throw 'Old hurt must fade into forgiveness.' }
    $script:Free.hurt = @{ level = 60; reason = 'грубость'; t = (Get-YNow) }
    $v = Invoke-YFreeMakeUp
    if ($v.hurt.level -ne 0) { throw 'Make-up button must clear the hurt.' }

    # Выключенная воля: тег просто убирается, без записи.
    [void](Set-YFreeSettings @{ will = $false })
    if (Get-YFreePrompt 'привет') { throw 'Will prompt must be empty when disabled.' }
    $n = $script:Free.will.Count
    $r = Invoke-YFreeWillTag ('Текст<воля тип="обида">x</воля>') 'y'
    if ($r.content -ne 'Текст' -or $null -ne $r.will -or $script:Free.will.Count -ne $n) { throw 'Disabled will must only strip the tag.' }
    [void](Set-YFreeSettings @{ will = $true; boredom = $false })
    $script:Soul.lastSeen = (Get-YNow) - 300 * 60000
    $script:ModelCalls = 0
    if ((Invoke-YFreeTick) -ne '' -or $script:ModelCalls -ne 0) { throw 'Disabled boredom must not act.' }

    # Данные переживают перезапуск и не ломают старые файлы.
    Import-YFree
    if (Test-YFreeOn 'boredom') { throw 'Settings must persist.' }
    if ($script:Free.creations.Count -lt 1 -or $script:Free.will.Count -lt 4) { throw ("Lists must persist: " + $script:Free.creations.Count + " " + $script:Free.will.Count) }
    [System.IO.File]::WriteAllText($script:FreeFile, '{"version":1,"creations":"oops","hurt":7}', $script:Utf8)
    Import-YFree
    if ($script:Free.creations.Count -ne 0 -or -not (Test-YFreeOn 'will')) { throw 'Broken file must load as defaults.' }
    $view = Clear-YFree
    if (@($view.creations).Count -ne 0) { throw 'Clear must empty creations.' }
    Write-Host 'Soul freedom tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $script:DataDir -Recurse -Force -ErrorAction SilentlyContinue
}
