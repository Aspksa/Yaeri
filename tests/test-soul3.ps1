#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach ($file in (Get-ChildItem (Join-Path $root 'launcher') -Filter '*.ps1')) {
    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw ($file.Name + ': ' + ($parseErrors | Out-String)) }
}
. (Join-Path $root 'launcher/yaeri-api.ps1')
$script:DataDir = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-soul3-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($script:DataDir)
$script:Y3File = Join-Path $script:DataDir 'soul3.json'
try {
    Import-Y3
    if (-not $script:Y3.enabled -or $script:Y3.affection -ne 1 -or $script:Y3.initiative) { throw 'Defaults incorrect.' }
    [void](Set-Y3 @{ affection = 2; initiative = $true })
    if ($script:Y3.affection -ne 2 -or -not $script:Y3.initiative) { throw 'Consent options not saved.' }
    $item = @{ id = 'msg1'; user = 'Мне нравится когда Яэри говорит нежно. Я очень дорожу нашей историей. Потому что я много работал, я устал.' }
    $extraction = @{
        soul3 = @{
            preference = @{ text = 'Предпочитает нежные обращения'; quote = 'Мне нравится когда Яэри говорит нежно' }
            attachment = @{ text = 'Дорожит общей историей'; quote = 'Я очень дорожу нашей историей' }
            interest = @{ text = 'Интересуется историями'; quote = 'нашей историей' }
            milestone = @{ text = 'Назвал общую историю важной'; quote = 'Я очень дорожу нашей историей' }
            repair = @{ text = 'Несуществующая поправка'; quote = 'Несуществующая цитата' }
            cause = @{ cause = 'Много работал'; effect = 'Устал'; quote = 'Потому что я много работал, я устал' }
        }
    }
    Add-Y3Learning $item $extraction
    if ($script:Y3.preferences.Count -ne 1 -or $script:Y3.moments.Count -ne 1 -or $script:Y3.causes.Count -ne 1 -or $script:Y3.repairs.Count -ne 0) { throw 'Grounded extraction incorrect.' }
    Add-Y3Learning $item $extraction
    if ($script:Y3.preferences.Count -ne 1 -or $script:Y3.interests.Count -ne 1) { throw 'Duplicate learning was not suppressed.' }
    [void](Add-Y3Promise @{ text = 'Напомнить о книге'; due = '2026-11-20' })
    $promiseId = [string]$script:Y3.promises[0].id
    [void](Set-Y3Promise @{ id = $promiseId; status = 'completed' })
    if ($script:Y3.promises[0].status -ne 'completed') { throw 'Promise status not saved.' }
    [void](Add-Y3Plan @{ goal = 'Завершить книгу'; steps = @('Написать план', 'Написать главу') })
    $plan = $script:Y3.plans[0]
    $sid = [string]$plan.steps[0].id
    [void](Set-Y3PlanStep @{ id = $plan.id; stepId = $sid; done = $true })
    if (-not [bool]$script:Y3.plans[0].steps[0].done) { throw 'Plan step was not completed.' }
    $prompt = Get-Y3Prompt
    if ($prompt -notmatch 'нежн' -or -not $prompt) { throw 'Relationship context absent.' }
    Import-Y3
    if ($script:Y3.plans.Count -ne 1 -or $script:Y3.promises.Count -ne 1 -or $script:Y3.preferences.Count -ne 1) { throw 'JSON persistence failed.' }
    [void](Clear-Y3)
    if ($script:Y3.plans.Count -ne 0 -or $script:Y3.promises.Count -ne 0 -or $script:Y3.preferences.Count -ne 0) { throw 'Soul3 reset failed.' }
    if ($script:Y3.affection -ne 2) { throw 'Soul3 reset must preserve consent settings.' }
    Write-Host 'Soul 3.0 tests passed.' -ForegroundColor Green
} finally {
    if (Test-Path $script:DataDir) { Remove-Item $script:DataDir -Force -Recurse }
}
