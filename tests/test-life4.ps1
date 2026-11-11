#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testData = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-life4-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($testData)
$script:YaeriDataOverride = $testData
. (Join-Path $root 'launcher/yaeri-api.ps1')
try {
    Import-YConfig
    Import-YStore
    $script:Config.apiKey = ''
    $now = Get-YNow
    [void]$script:Evo.facts.Add(@{
        id = 'fact1'; key = 'проект'; value = 'Яэри'; status = 'active'; t = $now
        evidence = (New-YEvidence 'user_quote' 'msg1' 'Мой проект Яэри' 0.9)
    })
    [void]$script:Evo.episodes.Add(@{
        id = 'evt1'; title = 'Начало'; text = 'Создали совместный проект'; status = 'active'; t = $now
        evidence = (New-YEvidence 'user_quote' 'msg2' 'Мы сделали проект' 0.9)
    })
    [void]$script:Evo.links.Add(@{ from = 'fact1'; to = 'evt1'; score = 0.88 })
    [void]$script:Y3.causes.Add(@{
        id = 'cause1'; cause = 'Началось обсуждение'; effect = 'Появился план'
        quote = 'Мы обсуждали'; t = $now; source = 'msg3'
    })
    [void]$script:Y3.plans.Add(@{ id = 'plan1'; goal = 'Развить память Яэри'; status = 'active'; t = $now })
    [void]$script:Notes.Add(@{ id = 'note1'; cat = 'Проекты'; text = 'Яэри — любимый проект'; t = $now
        evidence = (New-YEvidence 'user_manual' 'user' '' 1) })

    $world = Get-YLifeWorld
    if ($world.nodeCount -lt 4 -or $world.edgeCount -lt 2) { throw 'Grounded world nodes/edges missing.' }
    if (@($world.edges | Where-Object { $_.kind -eq 'claimed-cause' -and $_.evidence -eq 'user-statement-not-proof' }).Count -ne 1) {
        throw 'Causal claims were not distinguished from independently verified facts.'
    }
    if (-not (Get-YLifeWorldPrompt)) { throw 'World context prompt missing.' }

    [void](Set-YLifeSettings @{ language = 'playful'; nickname = 'Солнышко'; offline = $true; localModel = 'yaeri-local' })
    if (-not $script:YLife.offline -or $script:YLife.language -ne 'playful') { throw 'Offline/affection settings not saved.' }
    $script:Y3.enabled = $true; $script:Y3.affection = 1
    if ((Get-YLifeLanguagePrompt) -notmatch 'Солнышко') { throw 'Owner-approved nickname absent from prompt.' }
    $script:Y3.affection = 0
    if ((Get-YLifeLanguagePrompt) -notmatch 'без романтических') { throw 'Friendly boundaries ignored.' }
    try {
        Invoke-CloudRu 'GET' '/models' $null | Out-Null
        throw 'Unexpected Cloud.ru call in offline mode.'
    } catch {
        if ($_.Exception.Message -notmatch 'Автономный режим') { throw }
    }
    $status = Get-YStatus
    if (-not $status.offline -or -not $status.configured -or $status.provider -match 'Ollama') { throw 'Offline status is incorrect.' }

    # Simulate GGUF server not running; the built-in memory engine must
    # still work, and must not attempt to contact Cloud.ru.
    function Test-YLocalEngine { return @{ ok = $true; generative = $false; backend = 'memory-only' } }
    $answer = Invoke-YApi 'POST' '/api/chat' (ConvertTo-YJson @{
        text = 'Какие у нас планы?'; rag = $false; remember = $false
        soul = $false; autoNotes = $false; innerVoice = $false; selfCheck = $false
    })
    if (-not [string]$answer.reply.text -or $answer.reply.route -ne 'local-memory' -or
        [string]$answer.reply.model -ne 'memory-only') { throw 'Built-in offline chat failed.' }
    if ([string]$answer.reply.text -notmatch 'Развить память') { throw 'Offline chat did not use saved plans.' }
    $offlineMemory = Get-YOfflineReply 'Яэри проект'
    if ($offlineMemory -notmatch 'памят') { throw 'Lexical recall without embeddings failed.' }

    $tool = Add-YLifeToolProposal 'notes-list' 'Показать мои заметки' 'Посмотреть локально'
    if (-not $tool -or $tool.status -ne 'proposed') { throw 'Read-only tool proposal failed.' }
    try {
        Invoke-YLifeTool @{ id = $tool.id } | Out-Null
        throw 'Unapproved tool was executed.'
    } catch {
        if ($_.Exception.Message -notmatch 'одобрить') { throw }
    }
    [void](Set-YLifeTool @{ id = $tool.id; action = 'approve' })
    $out = Invoke-YLifeTool @{ id = $tool.id }
    if ($out.kind -ne 'notes-list' -or @($out.items).Count -ne 1) { throw 'Approved read-only tool failed.' }
    [void](Set-YLifeTool @{ id = $tool.id; action = 'disable' })
    if ($tool.status -ne 'off') { throw 'Disabled tool remained active.' }
    try {
        Add-YLifeToolProposal 'shell' 'Выполнить команду' 'Опасная функция' | Out-Null
        throw 'Unapproved shell tool was accepted.'
    } catch {
        if ($_.Exception.Message -notmatch 'Недопустимый тип') { throw }
    }

    Add-YLifeForecast @{ id = 'reply1' } @{
        question = 'Что изменится?'; options = @(@{ path = 'A'; outcome = 'B' })
    }
    if ($script:YLife.forecasts.Count -ne 1) { throw 'Prediction record missing.' }
    $forecast = $script:YLife.forecasts[0]
    [void](Set-YLifeForecast @{ id = $forecast.id; status = 'accurate'; outcome = 'Хозяин подтвердил' })
    if ((Get-YLifeReview).forecastAccuracyPercent -ne 100) { throw 'Independent owner feedback on outcome not counted.' }
    Save-YLife
    Import-YLife
    if (-not $script:YLife.offline -or $script:YLife.nickname -ne 'Солнышко' -or
        @($script:YLife.forecasts).Count -ne 1 -or @($script:YLife.tools).Count -ne 1) {
        throw 'Local Life state did not persist.'
    }
    # Stub a real on-device GGUF service without requiring its installation.
    function Test-YLocalEngine { return @{ ok = $true; generative = $true; backend = 'llama.cpp' } }
    function Invoke-YLocalLlama([string]$Endpoint, $Payload = $null) {
        if ($Endpoint -ne 'chat') { throw 'Unexpected local endpoint.' }
        return @{ choices = @(@{ message = @{ content = 'Локальный GGUF-ответ' } }) }
    }
    $generated = Invoke-YLocalChat @(@{ role = 'user'; content = 'Привет' })
    if ($generated.choices[0].message.content -ne 'Локальный GGUF-ответ' -or
        $script:YLocalLastBackend -ne 'llama.cpp') { throw 'Optional GGUF backend integration failed.' }
    Write-Host 'Life 4.0 world, self-assessment, affection, approved tools and Ollama-free offline tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
