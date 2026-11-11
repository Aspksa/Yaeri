#requires -Version 5.1
# Модуль «Дела»: хранение, теги Яэри (создать, закрыть, перенести, заметка) и подсказка для модели.
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testData = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-tasks-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($testData)
$script:YaeriDataOverride = $testData
. (Join-Path $root 'launcher/yaeri-api.ps1')
try {
    Import-YConfig
    Import-YStore
    if ($script:Tasks.Count -ne 0) { throw 'Fresh store must have no tasks.' }
    if ($script:TasksFile -notlike ($testData + '*')) { throw 'Tasks file must live in the data folder.' }

    # Ручное создание и правка через API.
    $a = (Save-YTask @{ text = '  Сдать   отчёт  '; due = '12.11.2026'; time = '9:30'; prio = 'высокий' }).item
    if ($a.text -ne 'Сдать отчёт' -or $a.due -ne '2026-11-12' -or $a.time -ne '09:30' -or $a.prio -ne 'high' -or $a.src -ne 'user') { throw ('Manual task fields wrong: ' + (ConvertTo-YJson $a)) }
    $b = (Save-YTask @{ text = 'Позвонить маме' }).item
    if ($b.due -ne '' -or $b.time -ne '' -or $b.prio -ne 'normal') { throw 'Task without date must have no time.' }
    $n = (Save-YTask @{ kind = 'note'; text = "Идея:`nкупить ёлку"; due = '2026-12-20' }).item
    if ($n.kind -ne 'note' -or -not $n.text.Contains("`n")) { throw 'Note must keep line breaks.' }
    [void](Save-YTask @{ id = $b.id; done = $true })
    if (-not $b.done -or [long]$b.doneAt -le 0) { throw 'Done flag not saved.' }
    [void](Save-YTask @{ id = $b.id; done = $false })
    if ($b.done -or [long]$b.doneAt -ne 0) { throw 'Reopen failed.' }
    $bad = $false
    try { [void](Save-YTask @{ text = '   ' }) } catch { $bad = $true }
    if (-not $bad) { throw 'Empty task accepted.' }

    # Подсказка для модели: сегодняшний день, календарь, просрочка.
    $days = @(
        @{ d = '2026-11-13'; w = 'пт'; type = 'work' },
        @{ d = '2026-11-14'; w = 'сб'; type = 'off' },
        @{ d = '2026-11-15'; w = 'вс'; type = 'off' },
        @{ d = 'bad'; type = 'work' },
        @{ d = '2026-11-16'; w = 'пн'; type = 'evil<tag>' }
    )
    $p = Get-YTasksPrompt $days
    if (-not $p.Contains('Сегодня 13 ноября 2026, пт, рабочий')) { throw ('Today line wrong: ' + $p) }
    if (-not $p.Contains('14.11 вых; 15.11 вых')) { throw ('Calendar line wrong: ' + $p) }
    if ($p.Contains('evil') -or $p.Contains('16.11')) { throw 'Invalid calendar day leaked into prompt.' }
    if (-not $p.Contains('[id ' + $a.id + '] «Сдать отчёт»') -or -not $p.Contains('[ПРОСРОЧЕНО]')) { throw ('Overdue task missing: ' + $p) }
    if (-not $p.Contains('Заметки хозяина')) { throw 'Notes missing from prompt.' }

    # Теги в ответе Яэри.
    $reply = 'Готово, записала и перенесла. <дело действие="создать" срок="2026-11-16" время="10:00" приоритет="низкий">Купить корм лисе</дело>' +
        '<дело действие="перенести" id="' + $a.id + '" срок="2026-11-16"></дело><дело действие="закрыть">позвонить маме</дело>' +
        '<заметка срок="2026-11-16">Код домофона 42</заметка><дело действие="закрыть" id="nope"/>'
    $r = Invoke-YTaskTags $reply
    if ($r.content -ne 'Готово, записала и перенесла.') { throw ('Tags not stripped: ' + $r.content) }
    if (@($r.acts).Count -ne 4) { throw ('Expected 4 actions: ' + ($r.acts -join ' | ')) }
    $c = @($script:Tasks | Where-Object { $_.text -eq 'Купить корм лисе' })[0]
    if ($null -eq $c -or $c.src -ne 'yaeri' -or $c.prio -ne 'low' -or $c.time -ne '10:00') { throw 'Created task wrong.' }
    if ($a.due -ne '2026-11-16') { throw 'Move failed.' }
    if (-not $b.done) { throw 'Close by text failed.' }
    if (@($script:Tasks | Where-Object { $_.kind -eq 'note' }).Count -ne 2) { throw 'Note tag failed.' }

    # Удаление и сохранение на диск.
    $r2 = Invoke-YTaskTags ('<дело действие="удалить" id="' + $c.id + '"></дело>Удалила.')
    if ($r2.content -ne 'Удалила.' -or $null -ne (Find-YTask $c.id)) { throw 'Delete by tag failed.' }
    [void](Remove-YTask @{ id = $n.id })
    $count = $script:Tasks.Count
    Import-YStore
    if ($script:Tasks.Count -ne $count) { throw 'Tasks not persisted.' }
    if ((Find-YTask $a.id).due -ne '2026-11-16') { throw 'Persisted move lost.' }
    Write-Host 'Tasks module tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $testData -Recurse -Force -ErrorAction SilentlyContinue
}
