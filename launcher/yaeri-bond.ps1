#requires -Version 5.1
# Soul 3.0: caring, attachment memory, reconciliation and optional initiatives.
function Add-Y3Preference([string]$Text, [string]$Quote, [string]$Original, [string]$Source) {
    [void](Add-Y3Memory $script:Y3.preferences 'preference' $Text $Quote $Original $Source)
}
function Add-Y3Attachment([string]$Text, [string]$Quote, [string]$Original, [string]$Source) {
    $added = Add-Y3Memory $script:Y3.moments 'attachment' $Text $Quote $Original $Source
    if ($added) {
        # Milestones are verified by the user's own quoted words, not by chat count.
        $script:Y3.trust = [Math]::Min(100, [int]$script:Y3.trust + 1)
        Add-Y3Growth 'trust' 'Укрепилось доверие благодаря подтверждённому совместному событию.' $Source
    }
}
function Add-Y3Repair([string]$Mistake, [string]$Correction, [string]$Quote, [string]$Original, [string]$Source) {
    $correction = Get-YCleanLine $Correction 270
    if (-not $correction -or -not (Test-YEvolutionQuote $Original $Quote)) { return }
    foreach ($x in $script:Y3.repairs) { if ((Get-YEvoNormalized ([string]$x.text)) -eq (Get-YEvoNormalized $correction)) { return } }
    [void]$script:Y3.repairs.Add(@{
        id = (New-YId); t = (Get-YNow); text = $correction
        mistake = (Get-YCleanLine $Mistake 240); quote = (Get-YCleanLine $Quote 320)
        source = $Source; status = 'learned'; evidence = (New-YEvidence 'user_quote' $Source $Quote 0)
    })
    Add-Y3Growth 'repair' ('Приняла исправление: ' + $correction) $Source
}
function Add-Y3Interest([string]$Text, [string]$Quote, [string]$Original, [string]$Source) {
    [void](Add-Y3Memory $script:Y3.interests 'interest' $Text $Quote $Original $Source)
}
function Add-Y3Milestone([string]$Text, [string]$Quote, [string]$Original, [string]$Source) {
    [void](Add-Y3Memory $script:Y3.milestones 'milestone' $Text $Quote $Original $Source)
}
function Invoke-Y3InitiativeTick {
    if (-not $script:Y3.enabled -or -not $script:Y3.initiative) { return }
    if ($null -eq $script:Soul -or [long]$script:Soul.exchanges -eq 0) { return }
    if ([bool]$script:Soul.thoughtNew) { return }
    $now = Get-YNow
    if ($now - [long]$script:Y3.initiativeAt -lt 24 * 3600000L) { return }
    if ($now - [long]$script:Soul.lastSeen -lt 30 * 60000L) { return }
    $topic = ''
    $source = ''
    if ($script:Y3.moments.Count -gt 0) {
        $last = $script:Y3.moments[$script:Y3.moments.Count - 1]
        $topic = [string]$last.text
        $source = [string]$last.source
    } elseif ($script:Y3.interests.Count -gt 0) {
        $last = $script:Y3.interests[$script:Y3.interests.Count - 1]
        $topic = [string]$last.text
        $source = [string]$last.source
    }
    if (-not $topic) { return }
    $topic = Get-YCleanLine $topic 150
    # This is a prepared optional in-app greeting, never an OS notification.
    $script:Soul.thought = 'Мне вспомнилась наша тема: «' + $topic + '». Если захочешь, можем снова к ней вернуться.'
    $script:Soul.thoughtNew = $true
    $script:Y3.initiativeAt = $now
    Add-Y3Growth 'initiative' ('Подготовлено ненавязчивое приглашение поговорить о теме: ' + $topic) $source
    Save-YSoul
    Save-Y3
}
function Get-Y3CareHint {
    if (-not $script:Y3.enabled) { return '' }
    $hint = 'Поддержка хозяина должна быть ненавязчивой и уважать его свободу. Не изображай ревность, обиду или потребность в постоянном общении.'
    if ($script:Y3.affection -eq 0) { $hint += ' Выбран дружеский стиль, избегай романтических обращений.' }
    if ($script:Y3.preferences.Count -gt 0) {
        $hint += ' Учитывай подтверждённые предпочтения: ' + (@($script:Y3.preferences | Select-Object -Last 3 | ForEach-Object { $_.text }) -join '; ')
    }
    return $hint
}
