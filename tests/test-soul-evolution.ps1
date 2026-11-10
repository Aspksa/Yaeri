#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($path in (Get-ChildItem (Join-Path $root 'launcher') -Filter '*.ps1')) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count -gt 0) { throw ($path.Name + ': ' + ($errors | Out-String)) }
}
. (Join-Path $root 'launcher/yaeri-api.ps1')
$script:DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-evolution-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($script:DataDir)
$script:EvoFile = Join-Path $script:DataDir 'soul-evolution.json'
try {
    Import-YEvolution
    if (-not $script:Evo.enabled) { throw 'Evolution should default to enabled.' }
    if (-not (Test-YEvolutionQuote 'Я живу в Москве' 'живу в Москве')) { throw 'Grounded quote rejected.' }
    if (Test-YEvolutionQuote 'Я живу в Москве' 'живу в Париже') { throw 'Invented quote accepted.' }
    Add-YEvolutionFact 'Город' 'Москва' 'Я живу в Москве' 'msg1' 0.9
    if ($script:Evo.facts.Count -ne 1 -or $script:Evo.facts[0].status -ne 'active') { throw 'Fact not inserted.' }
    Add-YEvolutionFact 'Город' 'Париж' 'живу в Париже' 'msg2' 0.4
    if ($script:Evo.facts.Count -ne 1) { throw 'Weak contradiction incorrectly replaced fact.' }
    Add-YEvolutionFact 'Город' 'Париж' 'живу в Париже' 'msg3' 0.93
    if ($script:Evo.facts.Count -ne 2 -or $script:Evo.facts[0].status -ne 'superseded') { throw 'New fact did not supersede old version.' }
    Add-YEvolutionEpisode 'Встреча' 'Я встретился с другом' 'встретился с другом' 'msg3' 0.8
    Add-YEvolutionCorrection 'Назвала другой город' 'Верно: Париж' 'Париж' 'msg3'
    Add-YEvolutionTurn @{ id = 'u1'; t = 1; text = 'Вчера я начал проект.' } @{ text = 'Это интересно!' } $true
    if ($script:Evo.queue.Count -ne 1) { throw 'Learning was not queued.' }
    Add-YEvolutionTurn @{ id = 'u2'; t = 2; text = 'Частный разговор.' } @{ text = 'Ответ.' } $false
    if ($script:Evo.queue.Count -ne 1) { throw 'Disabled memory enqueued a conversation.' }
    Save-YEvolution
    Import-YEvolution
    if ($script:Evo.facts.Count -ne 2 -or $script:Evo.episodes.Count -ne 1 -or $script:Evo.queue.Count -ne 1) { throw 'Persisted state was not restored.' }
    $view = Get-YEvolutionView
    if ($view.facts.Count -ne 2 -or $view.counts.corrections -ne 1) { throw 'Status endpoint snapshot is incorrect.' }
    [void](Set-YEvolution @{ enabled = $false })
    if ($script:Evo.enabled) { throw 'Background disable failed.' }
    Write-Host 'Soul Evolution smoke tests passed.' -ForegroundColor Green
} finally {
    if (Test-Path $script:DataDir) { Remove-Item $script:DataDir -Force -Recurse }
}
