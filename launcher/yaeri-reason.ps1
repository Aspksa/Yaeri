#requires -Version 5.1
# Soul 3.0: verified causality, uncertainty, error correction and practical planning.
function Add-Y3Cause([string]$Cause, [string]$Effect, [string]$Quote, [string]$Original, [string]$Source) {
    if (-not (Test-YEvolutionQuote $Original $Quote)) { return }
    $cause = Get-YCleanLine $Cause 160
    $effect = Get-YCleanLine $Effect 160
    if (-not $cause -or -not $effect) { return }
    foreach ($x in $script:Y3.causes) {
        if ((Get-YEvoNormalized $x.cause) -eq (Get-YEvoNormalized $cause) -and (Get-YEvoNormalized $x.effect) -eq (Get-YEvoNormalized $effect)) { return }
    }
    [void]$script:Y3.causes.Add(@{
        id = (New-YId); t = (Get-YNow); cause = $cause; effect = $effect
        quote = (Get-YCleanLine $Quote 320); source = $Source; status = 'user-claimed'
    })
    Add-Y3Growth 'causal' ('Записана заявленная связь: ' + $cause + ' → ' + $effect) $Source
}
function Get-Y3ReasonPrompt {
    if (-not $script:Y3.enabled) { return '' }
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add('Проверка рассуждений: разделяй факты, гипотезы и желания. Для причинно-следственной связи нужна подтверждённая причина, не путай последовательность событий с причинностью. Не скрывай неопределённость.')
    $claims = @($script:Y3.causes | Select-Object -Last 3)
    if ($claims.Count) { $lines.Add('Слова пользователя о причинах (ещё не независимое доказательство): ' + (@($claims | ForEach-Object { $_.cause + ' → ' + $_.effect }) -join '; ')) }
    $corrections = @($script:Evo.corrections | Select-Object -Last 4)
    if ($corrections.Count) { $lines.Add('Что было исправлено: ' + (@($corrections | ForEach-Object { $_.correct }) -join '; ')) }
    $plans = @($script:Y3.plans | Where-Object { $_.status -eq 'active' } | Select-Object -Last 2)
    foreach ($p in $plans) {
        $next = @($p.steps | Where-Object { -not [bool]$_.done } | Select-Object -First 1)
        if ($next.Count) { $lines.Add('Следующий шаг по плану «' + $p.goal + '»: ' + [string]$next[0].text + '. Не выдавай план за уже выполненное действие.') }
    }
    return ($lines -join [Environment]::NewLine)
}
function Add-Y3Plan($Req) {
    $goal = Get-YCleanLine ([string](Get-YValue $Req 'goal' '')) 240
    if (-not $goal) { throw (New-YError 400 'Введите цель плана.') }
    $steps = New-Object System.Collections.ArrayList
    $provided = Get-YValue $Req 'steps' @()
    foreach ($s in @($provided)) {
        if ($steps.Count -ge 8) { break }
        $line = Get-YCleanLine ([string]$s) 200
        if ($line) { [void]$steps.Add(@{ id = (New-YId); text = $line; done = $false }) }
    }
    if ([bool](Get-YValue $Req 'generate' $false)) {
        $sys = 'Ты помогаешь составить простой, выполнимый план для пользователя. Не утверждай, что задачи уже выполнены. Не требуй опасных действий. Ответь только JSON: {"steps":["шаг 1", "шаг 2", "шаг 3"]}. От 2 до 6 коротких конкретных шагов.'
        $obj = Get-YSoulJson (Invoke-YSoulModel $sys ('Цель пользователя: ' + $goal) (Get-YSoulReqModel @{} $true) 500 0.25)
        if ($null -eq $obj) { throw (New-YError 502 'Не удалось составить план.') }
        $steps.Clear()
        foreach ($s in @(Get-YValue $obj 'steps' @())) {
            if ($steps.Count -ge 6) { break }
            $line = Get-YCleanLine ([string]$s) 200
            if ($line) { [void]$steps.Add(@{ id = (New-YId); text = $line; done = $false }) }
        }
    }
    if ($steps.Count -eq 0) { throw (New-YError 400 'Добавьте шаги или включите автоматическое планирование.') }
    $p = @{ id = (New-YId); t = (Get-YNow); goal = $goal; steps = $steps.ToArray(); status = 'active' }
    [void]$script:Y3.plans.Add($p)
    Add-Y3Growth 'plan' ('Создан план по выбранной хозяином цели: ' + $goal) ''
    Save-Y3
    return Get-Y3View
}
function Set-Y3PlanStep($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $sid = [string](Get-YValue $Req 'stepId' '')
    $found = $false
    foreach ($p in $script:Y3.plans) {
        if ([string]$p.id -ne $id -or $p.status -ne 'active') { continue }
        foreach ($step in @($p.steps)) {
            if ([string]$step.id -ne $sid) { continue }
            $step.done = [bool](Get-YValue $Req 'done' $true)
            $found = $true
            break
        }
        if ($found) {
            $remaining = @($p.steps | Where-Object { -not [bool]$_.done })
            if ($remaining.Count -eq 0) {
                $p.status = 'completed'
                Add-Y3Growth 'achievement' ('Хозяин отметил завершение плана: ' + $p.goal) ''
            }
            break
        }
    }
    if (-not $found) { throw (New-YError 404 'Шаг плана не найден.') }
    Save-Y3
    return Get-Y3View
}
