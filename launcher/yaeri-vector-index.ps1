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
function Get-YVectorConflicts {
    $known = @{}
    $conflicts = New-Object System.Collections.Generic.List[object]
    foreach ($fact in $script:Evo.facts) {
        if (@('active','unverified','needs-review') -notcontains [string]$fact.status) { continue }
        $key = [string]$fact.key
        $value = [string]$fact.value
        if (-not $key) { continue }
        if ($known.ContainsKey($key) -and [string]$known[$key].value -ne $value) {
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
    return @{
        total = $items.Count; vectorized = $vectorized
        lexicalOnly = $items.Count - $vectorized
        bySpace = $bySpace; byEvidence = $byEvidence
        duplicates = $clusters.ToArray(); duplicateCount = $clusters.Count
        nearDuplicates = $near.ToArray(); nearDuplicateCount = $near.Count
        conflicts = $conflicts; conflictCount = $conflicts.Count
        old = $stale; status = 'informational-no-automatic-deletion'
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
function Search-YVector($Req) {
    $text = Get-YCleanLine ([string](Get-YValue $Req 'query' '')) 500
    if (-not $text) { throw (New-YError 400 'Напишите запрос для поиска в памяти.') }
    if (-not $script:YVector.enabled) { throw (New-YError 409 'Vector 2.0 отключён.') }
    $vec = $null
    if (Test-YConfigured) {
        try { $vec = [YaeriVec]::Decode((Get-YEmbeddings @($text))[0]) } catch { }
    }
    $hits = @(Find-YVectorMatches $text $vec 12)
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
    return @{ results = $response.ToArray(); total = $response.Count; mode = 'hybrid-local-rerank' }
}
