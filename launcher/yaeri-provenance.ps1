#requires -Version 5.1
# Unified evidence metadata. The quote identifies a user statement, but does
# NOT independently prove that the statement or the model's summary is true.
$script:YEvidenceKinds = @(
    'user_quote', 'user_manual', 'assistant_hypothesis',
    'assistant_generated', 'creative', 'conversation',
    'document', 'legacy_unverified'
)
function New-YEvidence([string]$Kind, [string]$SourceId = '', [string]$Quote = '', [double]$Confidence = 0) {
    if ($script:YEvidenceKinds -notcontains $Kind) { throw 'Unknown evidence origin.' }
    $status = switch ($Kind) {
        'user_quote' { 'attributed' }
        'user_manual' { 'direct' }
        'assistant_hypothesis' { 'unverified' }
        'assistant_generated' { 'unverified' }
        'creative' { 'fiction' }
        'conversation' { 'raw' }
        'document' { 'source' }
        default { 'unverified' }
    }
    $cleanQuote = ([regex]::Replace([string]$Quote, '\s+', ' ')).Trim()
    if ($cleanQuote.Length -gt 320) { $cleanQuote = $cleanQuote.Substring(0, 320) }
    return @{
        origin = $Kind; status = $status; sourceId = $SourceId
        quote = $cleanQuote
        confidence = [Math]::Round([Math]::Max(0, [Math]::Min(1, $Confidence)), 2)
        recordedAt = Get-YNow
    }
}
function Get-YEvidence($Item) {
    $raw = Get-YValue $Item 'evidence' $null
    if ($raw -is [System.Collections.IDictionary] -and
        $script:YEvidenceKinds -contains [string](Get-YValue $raw 'origin' '')) {
        return $raw
    }
    # Legacy records remain readable; never silently promote uncertain data
    # into a verified assertion just because the old file omitted metadata.
    $src = [string](Get-YValue $Item 'source' (Get-YValue $Item 'src' ''))
    $quote = [string](Get-YValue $Item 'quote' '')
    $kind = [string](Get-YValue $Item 'kind' '')
    if ($quote -and $src) { return New-YEvidence 'user_quote' $src $quote 0 }
    if (@('user', 'owner') -contains $src) { return New-YEvidence 'user_manual' $src '' 1 }
    if (@('dream','muse','reflection') -contains $kind) { return New-YEvidence 'creative' '' '' 0 }
    return New-YEvidence 'legacy_unverified' $src '' 0
}
function Get-YEvidenceLabel($Item) {
    $e = Get-YEvidence $Item
    switch ([string]$e.origin) {
        'user_quote' { return 'пересказ слов хозяина (не независимая проверка)' }
        'user_manual' { return 'записано хозяином' }
        'assistant_hypothesis' { return 'догадка Яэри, не факт' }
        'assistant_generated' { return 'интерпретация Яэри, не подтверждена' }
        'creative' { return 'творческая запись, не факт' }
        'conversation' { return 'фрагмент разговора, не установленный факт' }
        'document' { return 'фрагмент документа' }
        default { return 'старое воспоминание без проверенного источника' }
    }
}
function Get-YEvidenceView {
    $groups = @(
        @{ category = 'Факты'; items = @($script:Evo.facts) }
        @{ category = 'Эпизоды'; items = @($script:Evo.episodes) }
        @{ category = 'Исправления'; items = @($script:Evo.corrections) }
        @{ category = 'Отношения'; items = @($script:Y3.moments) + @($script:Y3.preferences) + @($script:Y3.repairs) }
        @{ category = 'Планы и обещания'; items = @($script:Y3.plans) + @($script:Y3.promises) }
        @{ category = 'Карта хозяина'; items = @($script:Und.map) }
        @{ category = 'Рабочая память'; items = @($script:Notes) }
        @{ category = 'Душа'; items = @($script:Soul.moments) + @($script:Soul.journal) }
        @{ category = 'Разговоры'; items = @($script:Memory) }
        @{ category = 'Документы'; items = @($script:Chunks) }
    )
    $counts = @{}
    $recent = New-Object System.Collections.Generic.List[object]
    foreach ($g in $groups) {
        foreach ($item in $g.items) {
            if (-not ($item -is [System.Collections.IDictionary])) { continue }
            $e = Get-YEvidence $item
            $kind = [string]$e.origin
            $counts[$kind] = [int]$counts[$kind] + 1
            $text = [string](Get-YValue $item 'text' (Get-YValue $item 'value' (Get-YValue $item 'summary' '')))
            if (-not $text) { $text = [string](Get-YValue $item 'title' '') }
            if ($text.Length -gt 180) { $text = $text.Substring(0, 180) + '…' }
            $recent.Add(@{
                category = [string]$g.category; origin = $kind
                label = Get-YEvidenceLabel $item
                id = [string](Get-YValue $item 'id' '')
                text = $text; sourceId = [string](Get-YValue $e 'sourceId' '')
            })
        }
    }
    return @{ version = 1; counts = $counts; recent = @($recent | Select-Object -Last 35); total = $recent.Count }
}
