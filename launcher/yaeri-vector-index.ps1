#requires -Version 5.1
# Vector 2.0: incremental indexing, non-destructive consolidation and diagnostics.
function Get-YVectorFingerprint([string]$Text) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes(([regex]::Replace([string]$Text, '\s+', ' ')).Trim())
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $hash.Dispose() }
}
function Get-YVectorCachedEmbeddings([string[]]$Texts) {
    # Deduplicate identical chunks without altering their original documents.
    $saved = @{}
    $model = [string]$script:Config.embeddingModel
    foreach ($x in @($script:Chunks) + @($script:Memory)) {
        $oldModel = $(if (Test-YKey $x 'docId') { [string]$script:DocsModel } else { [string]$script:MemoryModel })
        if ($oldModel -ne $model -or -not $x.vec) { continue }
        $hash = Get-YVectorFingerprint ([string]$x.text)
        if (-not $saved.ContainsKey($hash)) { $saved[$hash] = [string]$x.vec }
    }
    $new = New-Object System.Collections.Generic.List[string]
    $newHashes = New-Object System.Collections.Generic.List[string]
    foreach ($t in $Texts) {
        $hash = Get-YVectorFingerprint $t
        if (-not $saved.ContainsKey($hash) -and -not $newHashes.Contains($hash)) {
            $newHashes.Add($hash)
            $new.Add($t)
        }
    }
    if ($new.Count -gt 0) {
        $vectors = @(Get-YEmbeddings $new.ToArray())
        if ($vectors.Count -ne $new.Count) { throw (New-YError 502 'Неполный результат векторизации.') }
        for ($i = 0; $i -lt $new.Count; $i++) { $saved[[string]$newHashes[$i]] = [string]$vectors[$i] }
    }
    $result = New-Object System.Collections.Generic.List[string]
    foreach ($t in $Texts) { $result.Add([string]$saved[(Get-YVectorFingerprint $t)]) }
    if ($null -ne $script:YVector) {
        $script:YVector.embedded = [long]$script:YVector.embedded + $new.Count
        $script:YVector.reused = [long]$script:YVector.reused + $Texts.Count - $new.Count
        Save-YVector
    }
    return ,$result.ToArray()
}
function Update-YVectorIndex {
    $model = [string]$script:Config.embeddingModel
    $all = @(
        @{ name = 'docs'; items = $script:Chunks; oldModel = [string]$script:DocsModel },
        @{ name = 'conversation'; items = $script:Memory; oldModel = [string]$script:MemoryModel }
    )
    $reused = 0
    $updates = New-Object System.Collections.Generic.List[object]
    $keys = @{}
    $uniqueText = New-Object System.Collections.Generic.List[string]
    # Prepare all pending vectors without modifying the live in-memory records.
    foreach ($group in $all) {
        foreach ($item in @($group.items)) {
            $text = [string]$item.text
            $fingerprint = Get-YVectorFingerprint $text
            if ([string]$group.oldModel -eq $model -and [string]$item.vec -and
                (-not $item.vecHash -or [string]$item.vecHash -eq $fingerprint)) {
                $updates.Add(@{ item = $item; vector = [string]$item.vec; hash = $fingerprint })
                if (-not $keys.ContainsKey($fingerprint)) { $keys[$fingerprint] = [string]$item.vec }
                $reused++
            } else {
                $updates.Add(@{ item = $item; vector = ''; hash = $fingerprint })
                if (-not $keys.ContainsKey($fingerprint)) { $keys[$fingerprint] = '' }
            }
        }
    }
    $wanted = @{}
    foreach ($entry in $updates) {
        if ($entry.vector) { continue }
        $hash = [string]$entry.hash
        if ($keys[$hash]) { continue }
        if (-not $wanted.ContainsKey($hash)) {
            $wanted[$hash] = [string]$entry.item.text
            $uniqueText.Add($hash)
        }
    }
    if ($uniqueText.Count -gt 0) {
        $vectors = @(Get-YEmbeddings @($uniqueText | ForEach-Object { [string]$wanted[$_] }))
        if ($vectors.Count -ne $uniqueText.Count) { throw (New-YError 502 'Индекс эмбеддингов неполон.') }
        for ($i = 0; $i -lt $uniqueText.Count; $i++) { $keys[[string]$uniqueText[$i]] = [string]$vectors[$i] }
    }
    foreach ($entry in $updates) {
        $entry.item.vec = $(if ($entry.vector) { [string]$entry.vector } else { [string]$keys[[string]$entry.hash] })
        $entry.item.vecHash = [string]$entry.hash
    }
    $script:DocsModel = $model
    $script:MemoryModel = $model
    Save-YDocs
    Save-YMemory
    $script:VecCache = @{}
    $script:YVector.lastIndex = Get-YNow
    $script:YVector.reused = [long]$script:YVector.reused + $reused + ($updates.Count - $reused - $uniqueText.Count)
    $script:YVector.embedded = [long]$script:YVector.embedded + $uniqueText.Count
    Save-YVector
    return @{
        ok = $true; chunks = $script:Chunks.Count; memory = $script:Memory.Count
        embedded = $uniqueText.Count; reused = $updates.Count - $uniqueText.Count
        model = $model
    }
}
function Get-YMemory3NormalizedFact([string]$Text) {
    return ([regex]::Replace(([string]$Text).Trim().ToLowerInvariant(), '\s+', ' '))
}
function Get-YVectorConflicts {
    $known = @{}
    $conflicts = New-Object System.Collections.Generic.List[object]
    foreach ($fact in $script:Evo.facts) {
        if (@('active','unverified','needs-review') -notcontains [string]$fact.status) { continue }
        if (-not (Test-YMemory3Eligible $fact (Get-YNow))) { continue }
        $key = Get-YMemory3NormalizedFact ([string]$fact.key)
        $value = Get-YMemory3NormalizedFact ([string]$fact.value)
        if (-not $key) { continue }
        if ($known.ContainsKey($key) -and (Get-YMemory3NormalizedFact ([string]$known[$key].value)) -ne $value) {
            $conflicts.Add(@{
                key = $key; a = [string]$known[$key].value; b = $value
                first = [string]$known[$key].id; second = [string]$fact.id
                status = 'needs-review'
            })
        } elseif (-not $known.ContainsKey($key)) { $known[$key] = $fact }
        if ($conflicts.Count -ge 30) { break }
    }
    # Previous corrections/conflicts are surfaced as review tasks, not
    # automatically settled by the ranking model.
    foreach ($e in @($script:Evo.events | Select-Object -Last 100)) {
        if ([string]$e.kind -ne 'conflict' -or $conflicts.Count -ge 30) { continue }
        $conflicts.Add(@{
            key = [string]$e.text; a = ''; b = ''
            first = [string]$e.source; second = ''; status = 'needs-review'
        })
    }
    return $conflicts.ToArray()
}
function Get-YMemory3ConflictGroups($Facts, [int]$Limit = 30) {
    # Group all active competing values for a key without deciding which is true.
    $byKey = @{}
    foreach ($fact in @($Facts)) {
        if (@('active','unverified','needs-review') -notcontains [string](Get-YValue $fact 'status' '')) { continue }
        if (-not (Test-YMemory3Eligible $fact (Get-YNow))) { continue }
        $key = Get-YMemory3NormalizedFact ([string](Get-YValue $fact 'key' ''))
        $value = Get-YMemory3NormalizedFact ([string](Get-YValue $fact 'value' ''))
        if (-not $key -or -not $value) { continue }
        if (-not $byKey.ContainsKey($key)) { $byKey[$key] = @{} }
        if (-not $byKey[$key].ContainsKey($value)) {
            $byKey[$key][$value] = New-Object System.Collections.Generic.List[object]
        }
        $evidence = Get-YEvidence $fact
        $byKey[$key][$value].Add(@{
            id = [string](Get-YValue $fact 'id' '')
            value = [string](Get-YValue $fact 'value' '')
            origin = [string](Get-YValue $evidence 'origin' '')
            sourceId = [string](Get-YValue $evidence 'sourceId' '')
        })
    }
    $groups = New-Object System.Collections.Generic.List[object]
    foreach ($key in @($byKey.Keys | Sort-Object)) {
        $values = $byKey[$key]
        if ($values.Count -lt 2) { continue }
        $alternatives = New-Object System.Collections.Generic.List[object]
        foreach ($value in @($values.Keys | Sort-Object)) {
            $alternatives.Add(@{ normalizedValue = $value; records = $values[$value].ToArray() })
        }
        $groups.Add(@{ key = $key; alternatives = $alternatives.ToArray(); action = 'review-only' })
        if ($groups.Count -ge $Limit) { break }
    }
    return $groups.ToArray()
}
function Get-YMemory3ConsolidationReview($Candidates, [int]$Limit = 30) {
    # Non-destructive: preserve every original record and its provenance.
    $groups = @{}
    foreach ($item in @($Candidates)) {
        $normalized = ([regex]::Replace(([string]$item.text).Trim().ToLowerInvariant(), '\s+', ' '))
        if (-not $normalized) { continue }
        $hash = Get-YVectorFingerprint $normalized
        if (-not $groups.ContainsKey($hash)) {
            $groups[$hash] = New-Object System.Collections.Generic.List[object]
        }
        $groups[$hash].Add($item)
    }
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($hash in @($groups.Keys | Sort-Object)) {
        $group = $groups[$hash]
        if ($group.Count -lt 2) { continue }
        $members = New-Object System.Collections.Generic.List[object]
        $sources = @{}
        foreach ($item in $group) {
            $origin = [string]$item.evidence.origin
            $sources[$origin] = $true
            $members.Add(@{
                id = [string]$item.id; space = [string]$item.space
                origin = $origin
                sourceId = [string](Get-YValue $item.evidence 'sourceId' '')
            })
        }
        $out.Add(@{
            fingerprint = $hash; count = $group.Count
            distinctOrigins = @($sources.Keys | Sort-Object)
            members = $members.ToArray()
            action = 'review-only'
        })
        if ($out.Count -ge $Limit) { break }
    }
    return $out.ToArray()
}
function Get-YVectorQuality {
    $items = @(Get-YVectorCandidates)
    $bySpace = @{}
    $byEvidence = @{}
    $dupes = @{}
    $clusters = New-Object System.Collections.Generic.List[object]
    $stale = 0
    $vectorized = 0
    $near = New-Object System.Collections.Generic.List[object]
    $vecGroups = @{}
    $now = Get-YNow
    foreach ($item in $items) {
        $space = [string]$item.space
        $bySpace[$space] = [int]$bySpace[$space] + 1
        $origin = [string]$item.evidence.origin
        $byEvidence[$origin] = [int]$byEvidence[$origin] + 1
        if ($item.vec) {
            $vectorized++
            $space = [string]$item.space
            if (-not $vecGroups.ContainsKey($space)) { $vecGroups[$space] = New-Object System.Collections.Generic.List[object] }
            if ($vecGroups[$space].Count -lt 90) { $vecGroups[$space].Add($item) }
        }
        if ([long]$item.t -gt 0 -and $now - [long]$item.t -gt 365 * 86400000L) { $stale++ }
        $norm = (Get-YVectorFingerprint ([string]$item.text))
        if ($dupes.ContainsKey($norm)) {
            if ($clusters.Count -lt 30) {
                $first = $dupes[$norm]
                $clusters.Add(@{ first = [string]$first.space + ':' + [string]$first.id; second = $space + ':' + [string]$item.id; action = 'review-only' })
            }
        } else { $dupes[$norm] = $item }
    }
    # Near-duplicates are *suggestions*, never auto-merged. Semantic
    # similarity alone is insufficient, so compare size and shared terms.
    foreach ($space in @($vecGroups.Keys)) {
        $group = $vecGroups[$space]
        for ($i = 0; $i -lt $group.Count -and $near.Count -lt 20; $i++) {
            for ($j = $i + 1; $j -lt $group.Count -and $near.Count -lt 20; $j++) {
                $a = $group[$i]; $b = $group[$j]
                if ([string]$a.text -eq [string]$b.text) { continue }
                $size = [Math]::Min($a.text.Length, $b.text.Length) / [Math]::Max(1.0, [Math]::Max($a.text.Length, $b.text.Length))
                if ($size -lt 0.7) { continue }
                try { $similarity = [YaeriVec]::Dot([YaeriVec]::Decode([string]$a.vec), [YaeriVec]::Decode([string]$b.vec)) } catch { continue }
                if ($similarity -lt 0.975) { continue }
                $termsA = @(Get-YVectorTokens ([string]$a.text) | Select-Object -Unique)
                $termsB = @(Get-YVectorTokens ([string]$b.text) | Select-Object -Unique)
                if ($termsA.Count -eq 0 -or $termsB.Count -eq 0) { continue }
                $common = @($termsA | Where-Object { $termsB -contains $_ }).Count
                if ($common / [Math]::Max(1.0, [Math]::Min($termsA.Count, $termsB.Count)) -lt 0.55) { continue }
                $near.Add(@{
                    first = $space + ':' + [string]$a.id; second = $space + ':' + [string]$b.id
                    similarity = [Math]::Round($similarity, 3); action = 'review-only'
                })
            }
        }
    }
    $conflicts = @(Get-YVectorConflicts)
    $consolidation = @(Get-YMemory3ConsolidationReview $items)
    $conflictGroups = @(Get-YMemory3ConflictGroups $script:Evo.facts)
    return @{
        total = $items.Count; vectorized = $vectorized
        lexicalOnly = $items.Count - $vectorized
        bySpace = $bySpace; byEvidence = $byEvidence
        duplicates = $clusters.ToArray(); duplicateCount = $clusters.Count
        nearDuplicates = $near.ToArray(); nearDuplicateCount = $near.Count
        conflicts = $conflicts; conflictCount = $conflicts.Count
        conflictGroups = $conflictGroups; conflictGroupCount = $conflictGroups.Count
        consolidation = $consolidation; consolidationCount = $consolidation.Count
        old = $stale; status = 'informational-no-automatic-deletion'; memoryVersion = 3
        savedEmbeddings = [long]$script:YVector.reused
        newEmbeddings = [long]$script:YVector.embedded
    }
}
function Get-YVectorView {
    return @{
        enabled = $script:YVector.enabled; rerank = $script:YVector.rerank
        associations = $script:YVector.associations
        searches = $script:YVector.searches; lastSearch = $script:YVector.lastSearch
        lastIndex = $script:YVector.lastIndex
        quality = Get-YVectorQuality
    }
}
# Python-backed local embeddings; no Ollama or cloud network endpoint.
$script:YLocalEmbeddingCache = @{}
$script:YIndexSynced = @{}
function Invoke-YLocalEmbeddingService($Request) {
    if (-not $script:YEmbeddingPort) { throw 'Python embedding service is not running.' }
    $payload = ($Request | ConvertTo-Json -Compress -Depth 6) + "`n"
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect('127.0.0.1', [int]$script:YEmbeddingPort)
        $client.ReceiveTimeout = 120000
        $client.SendTimeout = 10000
        $stream = $client.GetStream()
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
        $stream.Write($bytes, 0, $bytes.Length)
        $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)
        $line = $reader.ReadLine()
        if (-not $line) { throw 'Empty Python embedding service response.' }
        $reply = ConvertFrom-Json $line
        if ($reply.error) { throw ([string]$reply.error) }
        return $reply
    } finally { $client.Dispose() }
}
function Get-YLocalEmbedding([string]$Text, [string]$Model = 'intfloat/multilingual-e5-small') {
    if ($Model -ne 'intfloat/multilingual-e5-small') { throw 'Unsupported local embedding model.' }
    $key = $Model + ':' + (Get-YVectorFingerprint $Text)
    if ($script:YLocalEmbeddingCache.ContainsKey($key)) { return ,$script:YLocalEmbeddingCache[$key] }
    $reply = Invoke-YLocalEmbeddingService @{ action = 'embed'; model = $Model; text = $Text }
    $vector = [YaeriVec]::Decode([string]$reply.vector)
    if ($vector.Length -lt 8) { throw 'Invalid local embedding.' }
    if ($script:YLocalEmbeddingCache.Count -ge 512) { $script:YLocalEmbeddingCache.Clear() }
    $script:YLocalEmbeddingCache[$key] = $vector
    return ,$vector
}
function Sync-YLocalSemanticIndex($Candidates) {
    $batch = New-Object System.Collections.Generic.List[object]
    foreach ($candidate in @($Candidates)) {
        $id = [string]$candidate.space + ':' + [string]$candidate.id
        $content = [string]$candidate.text
        if (-not $content) { continue }
        $fingerprint = Get-YVectorFingerprint $content
        if ($script:YIndexSynced.ContainsKey($id) -and $script:YIndexSynced[$id] -eq $fingerprint) { continue }
        $batch.Add(@{ id = $id; text = $content })
        if ($batch.Count -ge 32) {
            $response = Invoke-YLocalEmbeddingService @{ action = 'index'; items = $batch.ToArray() }
            if ([int]$response.accepted -lt $batch.Count) { break }
            foreach ($item in $batch) { $script:YIndexSynced[$item.id] = Get-YVectorFingerprint $item.text }
            $batch.Clear()
        }
    }
    if ($batch.Count -gt 0) {
        $response = Invoke-YLocalEmbeddingService @{ action = 'index'; items = $batch.ToArray() }
        if ([int]$response.accepted -eq $batch.Count) {
            foreach ($item in $batch) { $script:YIndexSynced[$item.id] = Get-YVectorFingerprint $item.text }
        }
    }
}
function Find-YLocalSemanticMatches([string]$Text, [string]$Model, [int]$Top = 12) {
    if ($Model -ne 'intfloat/multilingual-e5-small') { throw 'Unsupported local embedding model.' }
    $candidates = @(Get-YVectorCandidates)
    if ($candidates.Count -eq 0) { return @() }
    Sync-YLocalSemanticIndex $candidates
    $shortlist = @(Find-YVectorMatches $Text $null 32)
    $ranked = @{}
    foreach ($hit in $shortlist) {
        $key = [string]$hit.Item.space + ':' + [string]$hit.Item.id
        $ranked[$key] = $hit
    }
    $byId = @{}
    foreach ($candidate in $candidates) {
        $key = [string]$candidate.space + ':' + [string]$candidate.id
        $byId[$key] = $candidate
    }
    $queryVec = Get-YLocalEmbedding ('query: ' + $Text) $Model
    foreach ($hit in $shortlist) {
        $itemVec = Get-YLocalEmbedding ('passage: ' + [string]$hit.Item.text) $Model
        $similarity = [Math]::Max(0.0, [YaeriVec]::Dot($queryVec, $itemVec))
        $hit.Semantic = $similarity
        $hit.Score = [Math]::Round(0.55 * [double]$hit.Score + 0.45 * $similarity, 5)
    }
    $response = Invoke-YLocalEmbeddingService @{ action = 'search'; model = $Model; text = $Text }
    foreach ($match in @($response.results)) {
        $key = [string]$match.id
        if (-not $byId.ContainsKey($key)) { continue }
        $score = [Math]::Max(0.0, [double]$match.score)
        if ($score -lt 0.28) { continue }
        if ($ranked.ContainsKey($key)) {
            $hit = $ranked[$key]
            $hit.Semantic = [Math]::Max([double]$hit.Semantic, $score)
            $hit.Score = [Math]::Max([double]$hit.Score, [Math]::Round(0.45 * $score + 0.20 * [double]$hit.Lexical, 5))
        } else {
            $ranked[$key] = [pscustomobject]@{
                Item = $byId[$key]; Score = [Math]::Round(0.45 * $score, 5)
                Semantic = $score; Lexical = 0.0; Associated = $false
            }
        }
    }
    return @($ranked.Values | Sort-Object Score -Descending | Select-Object -First $Top)
}
function Search-YVector($Req) {
    $text = Get-YCleanLine ([string](Get-YValue $Req 'query' '')) 500
    if (-not $text) { throw (New-YError 400 'Напишите запрос для поиска в памяти.') }
    if (-not $script:YVector.enabled) { throw (New-YError 409 'Vector 2.0 отключён.') }
    # localOnly is an explicit privacy guarantee: never call the cloud embedding API.
    # Without a local embedding model, use the existing BM25 lexical retrieval.
    $localOnly = [bool](Get-YValue $Req 'localOnly' $true)
    $localSemantic = [bool](Get-YValue $Req 'localSemantic' $false)
    if ($localSemantic -and -not $localOnly) { throw (New-YError 400 'Local semantic search requires localOnly=true.') }
    $vec = $null
    if (-not $localOnly -and (Test-YConfigured)) {
        try { $vec = [YaeriVec]::Decode((Get-YEmbeddings @($text))[0]) } catch { }
    }
    $mode = 'local-lexical-bm25'
    if ($localSemantic) {
        try {
            $model = [string](Get-YValue $Req 'localModel' 'intfloat/multilingual-e5-small')
            $hits = @(Find-YLocalSemanticMatches $text $model 12)
            $mode = 'local-semantic-rerank'
        } catch { throw (New-YError 503 ('Python embeddings unavailable: ' + $_.Exception.Message)) }
    } else {
        $hits = @(Find-YVectorMatches $text $vec 12)
        if ($null -ne $vec) { $mode = 'hybrid-local-rerank' }
    }
    $response = New-Object System.Collections.Generic.List[object]
    foreach ($h in $hits) {
        $c = $h.Item
        $body = [string]$c.text
        if ($body.Length -gt 380) { $body = $body.Substring(0, 380) + '…' }
        $response.Add(@{
            id = [string]$c.id; space = [string]$c.space; text = $body
            score = [Math]::Round([double]$h.Score, 3)
            semantic = [double]$h.Semantic; lexical = [double]$h.Lexical
            source = Get-YEvidenceLabel $c.ref
            associated = [bool]$h.Associated; emotion = [string]$c.emotion; t = [long]$c.t
        })
    }
    $script:YVector.searches = [long]$script:YVector.searches + 1
    $script:YVector.lastSearch = Get-YNow
    Save-YVector
    return @{ results = $response.ToArray(); total = $response.Count; mode = $mode; localOnly = $localOnly }
}
