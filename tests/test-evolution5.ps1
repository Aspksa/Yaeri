#requires -Version 5.1
$ErrorActionPreference='Stop'
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tmp=Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-evolution5-test-'+[guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($tmp)
$script:YaeriDataOverride=$tmp
. (Join-Path $root 'launcher/yaeri-api.ps1')
function Assert-YE5([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
try {
    Import-YConfig
    Import-YStore
    Assert-YE5 ($script:YE5.enabled -and -not $script:YE5.periodic) 'Unexpected Evolution5 defaults.'
    $gap=Add-YE5Gap 'Как обнаруживать логические противоречия?' 'reasoning'
    Assert-YE5 ((Add-YE5Gap 'Как обнаруживать логические противоречия?' 'reasoning').id -eq $gap.id) 'Duplicate research gap.'
    Assert-YE5 ($script:YE5.gaps.Count -eq 1) 'Gap duplication.'
    $suggest=Invoke-YE5SelectGoal
    Assert-YE5 ($suggest.status -eq 'proposed') 'Goal must not be silently approved.'
    [void](Set-YE5Goal @{id=$suggest.id;action='approve'})
    $goal=Add-YE5Goal @{title='Изучать причинно-следственные связи';domain='research';ownerApproved=$true;impact=5;urgency=4;effort=2}
    Assert-YE5 ($goal.status -eq 'active') 'Owner goal not active.'
    $ranking=Get-YE5RankedGoals
    Assert-YE5 ($ranking.Count -eq 2 -and $ranking[0].id -eq $goal.id) 'Priority hierarchy did not favor high impact goal.'
    [void](Set-YE5Goal @{id=$goal.id;action='step';note='Собрали проверенные источники'})
    Assert-YE5 ([int]$goal.progress -eq 15 -and @($goal.log).Count -eq 1) 'Multi-day progress not preserved.'
    $cycle=Invoke-YE5Cycle $true
    Assert-YE5 ($cycle.ran -and -not $cycle.usedCloud) 'Daily cycle should be local and rate limited.'
    $again=Invoke-YE5Cycle
    Assert-YE5 (-not $again.ran -and $again.reason -eq 'daily-limit') 'Cycle ran twice within one day.'

    $hyp=Add-YE5Hypothesis @{cause='Уточнение источников';effect='Меньше ошибок';basis='Опыт общения'}
    Assert-YE5 ($hyp.status -eq 'unverified') 'Hypothesis incorrectly marked as true.'
    $exp=Add-YE5Experiment @{
        hypothesisId=$hyp.id;alternative='Лучше сформулирован вопрос'
        prediction='Чаще верные ответы';measure='Оценки хозяина до и после'
    }
    Assert-YE5 ($exp.status -eq 'proposed') 'Thought experiment was automatically executed.'
    [void](Set-YE5Experiment @{id=$exp.id;result='refuted'})
    Assert-YE5 ($exp.status -eq 'reviewed' -and $hyp.status -eq 'owner-reviewed') 'Hypothesis evidence review failed.'

    [void]$script:Evo.facts.Add(@{id='factA';status='active';key='Интерес';value='изучать логику';evidence=(New-YEvidence 'user_quote' 'm1' 'Изучаю логику' 0.7)})
    [void]$script:Evo.episodes.Add(@{id='episodeB';status='active';title='Пример';text='Заметили ошибку';evidence=(New-YEvidence 'user_quote' 'm2' 'Была ошибка' 0.7)})
    $concept=Add-YE5Concept @{title='Проверка идей';idea='Объединять примеры и знания';sources=@('factA','episodeB')}
    Assert-YE5 (@($concept.sources).Count -ge 2 -and $concept.status -eq 'proposed') 'Cross-source synthesis missing.'
    [void](Set-YE5Concept @{id=$concept.id;action='approve'})
    Assert-YE5 ($concept.status -eq 'approved') 'Concept approval did not persist.'

    $bench=Get-YE5BenchSuite 'causal-check'
    Assert-YE5 ($bench.safety -and $bench.passed -gt (Get-YE5BenchSuite '').passed) 'Policy benchmark did not improve coverage.'
    $strategy=Add-YE5Strategy @{method='causal-check';domain='reasoning'}
    Assert-YE5 ($strategy.status -eq 'proposed' -and $strategy.tested) 'Strategy activated before approval.'
    [void](Set-YE5Strategy @{id=$strategy.id;action='approve'})
    Assert-YE5 ($strategy.status -eq 'active') 'Owner strategy approval failed.'
    Assert-YE5 ((Get-YE5StrategyPrompt 'Почему это произошло и как проверить причины?') -match 'причинную') 'Active strategy missing from reasoning prompt.'
    Assert-YE5 ((Get-YE5DepthDecision 'привет').mode -eq 'quick') 'Simple question routed too deep.'
    Assert-YE5 ((Get-YE5DepthDecision 'Объясни причинные связи, сравни альтернативы и проверь доказательства').mode -eq 'deep') 'Complex reasoning not detected.'
    Assert-YE5 ((Get-YE5DepthDecision 'Какие риски у этого лекарства?').mode -eq 'careful') 'Risk-sensitive mode missing.'
    $transfer=Add-YE5Transfer @{strategyId=$strategy.id;targetDomain='learning';example='Проверить две учебные причины ошибки'}
    Assert-YE5 ($transfer.status -eq 'proposed') 'Transferred strategy activated automatically.'
    [void](Set-YE5Transfer @{id=$transfer.id;action='approve'})
    Assert-YE5 ($transfer.status -eq 'approved') 'Transfer review missing.'

    $cal=Add-YE5Calibration @{claim='В следующем тесте всё пройдёт';percent=90;method='causal-check'}
    Assert-YE5 ($cal.status -eq 'pending') 'Confidence prediction must remain unverified.'
    [void](Set-YE5Calibration @{id=$cal.id;outcome='yes'})
    Assert-YE5 ([Math]::Abs([double](Get-YE5CalibrationReport).brier-0.01) -lt 0.001) 'Brier calibration incorrect.'
    foreach ($percent in @(70,80)) {
        $x=Add-YE5Calibration @{claim=('Ещё один тест '+$percent);percent=$percent;method='causal-check'}
        [void](Set-YE5Calibration @{id=$x.id;outcome='yes'})
    }
    Assert-YE5 ((Get-YE5LearningReport).bestMethod -eq 'causal-check') 'Learning-to-learn did not select verified method.'
    Add-YE5Rating 'reply-bad' -1 'Логическая ошибка, слишком уверенное утверждение'
    Assert-YE5 (@($script:YE5.errors | Where-Object {$_.category -eq 'reasoning'}).Count -eq 1) 'Error categories not remembered.'
    Add-YE5Rating 'reply-bad' 0 ''
    Assert-YE5 ($script:YE5.errors.Count -eq 0) 'Corrected rating left stale error.'

    # Synthetic *owner* ratings test conservative automatic regression rollback.
    for($i=0;$i -lt 6;$i++){
        [void]$script:Und.ratings.Add(@{id=('old'+$i);t=(Get-YNow)-86400000L;score=1})
    }
    $guard=Add-YE5Strategy @{method='uncertainty';domain='research'}
    [void](Set-YE5Strategy @{id=$guard.id;action='approve'})
    Assert-YE5 ($guard.status -eq 'active' -and [int]$guard.before.n -ge 6) 'Regression baseline missing.'
    for($i=0;$i -lt 6;$i++){
        [void]$script:Und.ratings.Add(@{id=('new'+$i);t=[long]$guard.approvedAt+10000L+$i;score=-1})
    }
    $reg=Get-YE5Regression
    Assert-YE5 ($reg.reverted -ge 1 -and $guard.status -eq 'rolled-back') 'Bad strategy not rolled back after sufficient negative ratings.'
    Assert-YE5 ($strategy.status -eq 'active') 'Earlier strategy incorrectly rolled back without its own new evidence.'

    # One mocked Cloud.ru study call, sources must be independently present
    # and model output must remain a proposal.
    function Test-YConfigured {return $true}
    function Test-YCurBudget {return $true}
    $script:StudyCalls=0
    function Get-YDepCall([string]$System,[string]$User,[int]$MaxTokens,[double]$Temperature){
        $script:StudyCalls++
        return @{
            cause='Сравнение источников';effect='Лучше видны противоречия';basis='Два сообщения'
            alternative='Мог повлиять опыт';prediction='Вывод становится точнее'
            measure='Сравнить оценки хозяина';title='Многопроверочный подход'
            idea='Использовать несколько независимых воспоминаний';sourceIds=@('factA','episodeB')
            next='Запросить подтверждение результата.'
        }
    }
    $research=Invoke-YE5Research @{goalId=$goal.id}
    Assert-YE5 ($script:StudyCalls -eq 1 -and -not $research.verified -and $research.concept) 'Optional bounded research did not produce proposals.'
    $sourced=Get-YE5Item 'concepts' ([string]$research.concept)
    Assert-YE5 ($sourced.status -eq 'proposed') 'Generated concept promoted without confirmation.'

    Save-YE5
    Import-YE5
    Assert-YE5 (@($script:YE5.goals).Count -ge 2 -and
        @($script:YE5.strategies | Where-Object {$_.status -eq 'rolled-back'}).Count -ge 1 -and
        @($script:YE5.calibrations).Count -eq 3) 'Evolution 5.0 failed to persist state.'
    $view=Get-YE5View
    Assert-YE5 (@($view.logs).Count -ge 1 -and $view.learning.bestMethod -eq 'causal-check') 'Evolution 5.0 dashboard missing.'
    Write-Host 'Evolution 5.0 goal selection, experiments, synthesis, strategy tests, calibration, rollback, source-grounded research and persistence passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
