#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testData = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-evidence-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($testData)
$script:YaeriDataOverride = $testData
. (Join-Path $root 'launcher/yaeri-api.ps1')
try {
    Import-YConfig
    Import-YStore
    $direct = New-YEvidence 'user_manual' 'user' '' 1
    if ($direct.origin -ne 'user_manual' -or $direct.status -ne 'direct') { throw 'Direct evidence invalid.' }
    $quoted = New-YEvidence 'user_quote' 'm1' 'дословные слова' 0.9
    if ($quoted.sourceId -ne 'm1' -or $quoted.quote -ne 'дословные слова' -or $quoted.status -ne 'attributed') { throw 'Quote evidence invalid.' }
    $legacy = Get-YEvidence @{ text = 'старое' }
    if ($legacy.origin -ne 'legacy_unverified') { throw 'Legacy record was silently marked as verified.' }
    if ((Get-YEvidence @{ quote = 'слова'; source = 'msg1' }).origin -ne 'user_quote') { throw 'Legacy quoted record not attributed.' }
    if ((Get-YEvidence (New-YSoulEntry 'dream' 'Мне приснился сад' 'мечтательное')).origin -ne 'creative') { throw 'Dream incorrectly considered factual.' }
    if (-not (Test-YEvolutionQuote 'Я люблю зелёный цвет' 'люблю зелёный')) { throw 'Quote validation broken.' }
    Add-YEvolutionFact 'любимый цвет' 'зелёный' 'люблю зелёный' 'm1' 0.9
    if ((Get-YEvidence $script:Evo.facts[0]).origin -ne 'user_quote') { throw 'Fact evidence missing.' }
    [void](Add-YNoteItem 'Планы' 'Составить список дел' 'yaeri')
    if ((Get-YEvidence $script:Notes[0]).origin -ne 'assistant_generated') { throw 'Generated note marked as confirmed.' }
    $noteId = [string]$script:Notes[0].id
    [void](Update-YNote @{ id = $noteId; text = 'Хозяин уточнил список дел' })
    if ((Get-YEvidence $script:Notes[0]).origin -ne 'user_manual') { throw 'Owner-edited note not marked as direct.' }
    [void](Add-Y3Promise @{ text = 'Напомнить обсудить книгу' })
    if ((Get-YEvidence $script:Y3.promises[0]).origin -ne 'user_manual') { throw 'Promise source missing.' }
    $view = Get-YEvidenceView
    if ($view.total -lt 3 -or $view.counts.user_manual -lt 2) { throw 'Evidence audit incomplete.' }
    Save-YEvolution
    Save-YNotes
    Save-Y3
    Import-YStore
    if ((Get-YEvidence $script:Evo.facts[0]).sourceId -ne 'm1' -or
        (Get-YEvidence $script:Notes[0]).origin -ne 'user_manual' -or
        (Get-YEvidence $script:Y3.promises[0]).origin -ne 'user_manual') { throw 'Evidence persistence failed.' }
    Write-Host 'Evidence provenance tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
