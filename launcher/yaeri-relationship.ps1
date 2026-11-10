#requires -Version 5.1
# Soul 3.0: transparent promises and evidence-based relationship learning.
function Add-Y3Promise($Req) {
    $text = Get-YCleanLine ([string](Get-YValue $Req 'text' '')) 300
    if (-not $text) { throw (New-YError 400 'Введите обещание или договорённость.') }
    $due = [string](Get-YValue $Req 'due' '')
    if ($due -and $due -notmatch '^\d{4}-\d{2}-\d{2}$') { throw (New-YError 400 'Дата должна быть в формате ГГГГ-ММ-ДД.') }
    if ($due) {
        $date = [datetime]::MinValue
        if (-not [datetime]::TryParseExact($due, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$date)) {
            throw (New-YError 400 'Неверная календарная дата.')
        }
    }
    [void]$script:Y3.promises.Add(@{
        id = (New-YId); t = (Get-YNow); text = $text
        due = $due; status = 'active'; lastReminded = 0L
    })
    Add-Y3Growth 'promise' ('Добавлена явная договорённость: ' + $text) ''
    Save-Y3
    return Get-Y3View
}
function Set-Y3Promise($Req) {
    $id = [string](Get-YValue $Req 'id' '')
    $status = [string](Get-YValue $Req 'status' '')
    if (@('completed', 'cancelled') -notcontains $status) { throw (New-YError 400 'Неизвестный статус.') }
    $found = $false
    foreach ($promise in $script:Y3.promises) {
        if ([string]$promise.id -ne $id) { continue }
        if ($promise.status -ne 'active') { throw (New-YError 409 'Договорённость уже закрыта.') }
        $promise.status = $status
        $promise.closed = Get-YNow
        $found = $true
        if ($status -eq 'completed') {
            $script:Y3.trust = [Math]::Min(100, [int]$script:Y3.trust + 2)
            Add-Y3Growth 'reliability' ('Хозяин подтвердил выполнение договорённости: ' + $promise.text) ''
        }
        break
    }
    if (-not $found) { throw (New-YError 404 'Договорённость не найдена.') }
    Save-Y3
    return Get-Y3View
}
function Add-Y3Learning($Item, $Extraction) {
    if (-not $script:Y3.enabled) { return }
    $x = Get-YValue $Extraction 'soul3' $null
    if ($x -isnot [System.Collections.IDictionary]) { return }
    $original = [string]$Item.user
    $source = [string]$Item.id
    $v = Get-YValue $x 'preference' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Preference ([string](Get-YValue $v 'text' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    $v = Get-YValue $x 'attachment' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Attachment ([string](Get-YValue $v 'text' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    $v = Get-YValue $x 'milestone' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Milestone ([string](Get-YValue $v 'text' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    $v = Get-YValue $x 'interest' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Interest ([string](Get-YValue $v 'text' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    $v = Get-YValue $x 'repair' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Repair ([string](Get-YValue $v 'mistake' '')) ([string](Get-YValue $v 'text' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    $v = Get-YValue $x 'cause' $null
    if ($v -is [System.Collections.IDictionary]) {
        Add-Y3Cause ([string](Get-YValue $v 'cause' '')) ([string](Get-YValue $v 'effect' '')) ([string](Get-YValue $v 'quote' '')) $original $source
    }
    Save-Y3
}
function Invoke-Y3Tick {
    if (-not $script:Y3.enabled) { return }
    if ($script:Y3.initiative) {
        # A pending promise is never claimed as done. The reminder appears only
        # via the app's existing optional thought-sharing flow.
        $today = [datetime]::Now.Date
        foreach ($p in $script:Y3.promises) {
            if ($p.status -ne 'active' -or -not $p.due) { continue }
            $due = [datetime]::MinValue
            if (-not [datetime]::TryParseExact([string]$p.due, 'yyyy-MM-dd', [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::None, [ref]$due)) { continue }
            if ($due -gt $today -or (Get-YNow) - [long]$p.lastReminded -lt 24 * 3600000L) { continue }
            if (-not [bool]$script:Soul.thoughtNew) {
                $script:Soul.thought = 'Мы отмечали одну договорённость: «' + (Get-YCleanLine ([string]$p.text) 140) + '». Подскажешь, как продвигается?'
                $script:Soul.thoughtNew = $true
                $p.lastReminded = Get-YNow
                Save-YSoul
                Save-Y3
            }
            break
        }
        Invoke-Y3InitiativeTick
    }
}
