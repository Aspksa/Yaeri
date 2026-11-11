#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('yaeri-vector2-test-' + [guid]::NewGuid().ToString('N'))
[void][System.IO.Directory]::CreateDirectory($tmp)
$script:YaeriDataOverride = $tmp
. (Join-Path $root 'launcher/yaeri-api.ps1')
try {
    Import-YConfig
    Import-YStore
    $script:Config.apiKey = ''
    if (-not $script:YVector.enabled -or -not $script:YVector.rerank -or -not $script:YVector.associations) { throw 'Vector 2.0 defaults are incorrect.' }
    $model = [string]$script:Config.embeddingModel
    $script:DocsModel = $model
    $script:MemoryModel = $model
    $v1 = [YaeriVec]::Encode([object[]]@(1.0,0.0,0.0))
    $v2 = [YaeriVec]::Encode([object[]]@(0.0,1.0,0.0))
    $now = Get-YNow
    [void]$script:Chunks.Add(@{ id = 'd1'; docId = 'doc1'; docName = 'Дневник'; n = 1; text = 'Лисий лес рядом с озером'; vec = $v1; t = $now; evidence = (New-YEvidence 'document' 'doc1') })
    [void]$script:Chunks.Add(@{ id = 'd2'; docId = 'doc1'; docName = 'Дневник'; n = 2; text = 'Лисий лес рядом с озером'; vec = $v1; t = $now; evidence = (New-YEvidence 'document' 'doc1') })
    [void]$script:Memory.Add(@{ id = 'm1'; t = $now - 90000; text = 'Хозяин обсуждал лисий лес и озеро'; vec = $v1; evidence = (New-YEvidence 'conversation' 'msg1') })
    [void]$script:Evo.facts.Add(@{ id = 'f1'; key = 'любимое место'; value = 'лисий лес'; status = 'active'; created = $now; vec = $v1; vecModel = $model; evidence = (New-YEvidence 'user_quote' 'msg1' 'Я люблю лисий лес' 0.9) })
    [void]$script:Evo.facts.Add(@{ id = 'f2'; key = 'любимое место'; value = 'лисий сад'; status = 'active'; created = $now; vec = $v2; vecModel = $model; evidence = (New-YEvidence 'user_quote' 'msg2' 'Я люблю лисий сад' 0.8) })
    [void]$script:Evo.episodes.Add(@{ id = 'e1'; title = 'История путешествия'; text = 'Старинная прогулка по лесу'; status = 'active'; created = $now - 10 * 86400000L; importance = 0.9; vec = $v2; vecModel = $model; evidence = (New-YEvidence 'user_quote' 'msg3' 'Мы гуляли в лесу' 0.9) })
    [void]$script:Evo.links.Add(@{ from = 'f1'; to = 'e1'; score = 0.88 })
    [void]$script:Y3.preferences.Add(@{ id = 'p1'; text = 'Хозяину нравится нежное общение'; t = $now; evidence = (New-YEvidence 'user_quote' 'msg4' 'Мне нравится нежное общение') })
    [void]$script:Notes.Add(@{ id = 'n1'; cat = 'Идеи'; text = 'Прогулка в лисьем лесу'; t = $now; evidence = (New-YEvidence 'user_manual' 'user') })

    $query = [YaeriVec]::Decode($v1)
    $hits = @(Find-YVectorMatches 'лисий лес' $query 10)
    if ($hits.Count -lt 3) { throw 'Hybrid search returned too few results.' }
    if (@($hits | Where-Object { $_.Item.space -eq 'document' }).Count -lt 1) { throw 'Document space missing.' }
    if (@($hits | Where-Object { $_.Item.space -eq 'fact' }).Count -lt 1) { throw 'Fact space missing.' }
    if (@($hits | Where-Object { $_.Item.space -eq 'conversation' }).Count -lt 1) { throw 'Conversation space missing.' }
    if (@($hits | Where-Object { $_.Associated }).Count -lt 1) { throw 'Association graph expansion missing.' }
    $uniqueDocs = @($hits | Where-Object { $_.Item.space -eq 'document' })
    if ($uniqueDocs.Count -ne 1) { throw 'Repeated identical chunks were not consolidated.' }
    $oldOnly = @(Find-YVectorMatches 'лисий лес' $query 10 ($now - 180000))
    if (@($oldOnly | Where-Object { $_.Item.id -eq 'm1' }).Count -ne 0) { throw 'Recent conversation leaked into old-memory retrieval.' }
    $lexical = @(Find-YVectorMatches 'нежное общение' $null 10)
    if (@($lexical | Where-Object { $_.Item.id -eq 'p1' }).Count -ne 1) { throw 'Lexical-only preferences missing.' }
    if ((Get-YVectorEmotionTag (New-YEvidence 'user_quote' 'm5' 'Мне было очень грустно')) -ne 'грусть') { throw 'Quoted emotional context missing.' }
    if ((Get-YVectorEmotionTag (New-YEvidence 'assistant_generated' '' 'Мне было очень грустно')) -ne '') { throw 'Model-generated emotion was treated as owner emotion.' }

    Add-YVectorFeedback 'reply1' 1 @(@{ vectorKey = 'document:d1' })
    if ((Get-YVectorFeedbackBoost 'document' 'd1') -le 0) { throw 'Positive relevance feedback ignored.' }
    Add-YVectorFeedback 'reply1' -1 @(@{ vectorKey = 'document:d1' })
    if ((Get-YVectorFeedbackBoost 'document' 'd1') -ge 0 -or $script:YVector.feedback.Count -ne 1) { throw 'Rating edit double-counted.' }
    Add-YVectorFeedback 'reply1' 0 @()
    if ($script:YVector.feedback.Count -ne 0) { throw 'Feedback reset ignored.' }

    $quality = Get-YVectorQuality
    if ($quality.bySpace.document -ne 2 -or $quality.bySpace.fact -ne 2) { throw 'Vector collections are not separated.' }
    if ($quality.duplicateCount -lt 1) { throw 'Duplicate diagnostics missing.' }
    if ($quality.conflictCount -lt 1) { throw 'Conflicting facts were not flagged.' }
    $index = Update-YVectorIndex
    if ($index.embedded -ne 0 -or $index.reused -lt 3) { throw 'Unmodified embeddings were recalculated.' }

    $script:FakeCalls = 0
    function Get-YEmbeddings([string[]]$Texts) {
        $script:FakeCalls += $Texts.Count
        $out = @($Texts | ForEach-Object { [YaeriVec]::Encode([object[]]@(0.0,1.0,0.0)) })
        return ,$out
    }
    $script:Chunks[0].text = 'Обновлённая история о лисьем лесу'
    $second = Update-YVectorIndex
    if ($second.embedded -ne 1 -or $script:FakeCalls -ne 1) { throw 'Incremental reindex did not update only changed text.' }
    $cached = @(Get-YVectorCachedEmbeddings @('Лисий лес рядом с озером'))
    if ($cached.Count -ne 1 -or $script:FakeCalls -ne 1) { throw 'Exact duplicate embedding reuse failed.' }
    $view = Get-YVectorView
    if (-not $view.quality -or $view.quality.total -lt 5) { throw 'Vector quality status missing.' }
    $search = Search-YVector @{ query = 'лисий лес' }
    if ($search.total -lt 1 -or $search.mode -ne 'hybrid-local-rerank') { throw 'Local search endpoint failed.' }
    [void](Set-YVector @{ enabled = $false; rerank = $false })
    if ($script:YVector.enabled -or $script:YVector.rerank) { throw 'Vector settings not applied.' }
    Import-YVector
    if ($script:YVector.enabled -or $script:YVector.rerank -or $script:YVector.embedded -lt 1) { throw 'Vector 2.0 state was not persisted.' }
    Write-Host 'Yaeri Vector 2.0 hybrid, feedback, quality and incremental indexing tests passed.' -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
