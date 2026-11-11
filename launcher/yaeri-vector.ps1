#requires -Version 5.1
# Yaeri Vector 2.0: unified, source-aware retrieval and local reranking.
# No external DB, extra reranker model, or Python dependency.
$script:YVectorFile = Join-Path $script:DataDir 'vector-v2.json'
function Import-YVector {
    $raw = $null
    try { $raw = Read-YJsonFile $script:YVectorFile } catch { $raw = $null }
    $script:YVector = @{
        version = 2
        enabled = [bool](Get-YValue $raw 'enabled' $true)
        rerank = [bool](Get-YValue $raw 'rerank' $true)
        associations = [bool](Get-YValue $raw 'associations' $true)
        feedback = (Get-YEvoArray (Get-YValue $raw 'feedback' @()))
        searches = [long](Get-YNum (Get-YValue $raw 'searches' 0) 0)
        lastSearch = [long](Get-YNum (Get-YValue $raw 'lastSearch' 0) 0)
        lastIndex = [long](Get-YNum (Get-YValue $raw 'lastIndex' 0) 0)
        reused = [long](Get-YNum (Get-YValue $raw 'reused' 0) 0)
        embedded = [long](Get-YNum (Get-YValue $raw 'embedded' 0) 0)
    }
}
function Save-YVector {
    while ($script:YVector.feedback.Count -gt 400) { $script:YVector.feedback.RemoveAt(0) }
    $plain = @{}
    foreach ($k in @($script:YVector.Keys)) {
        if ($k -eq 'feedback') { $plain[$k] = $script:YVector.feedback.ToArray() }
        else { $plain[$k] = $script:YVector[$k] }
    }
    Write-YJsonFile $script:YVectorFile $plain
}
function Set-YVector($Req) {
    foreach ($key in @('enabled','rerank','associations')) {
        if (Test-YKey $Req $key) { $script:YVector[$key] = [bool]$Req[$key] }
    }
    Save-YVector
    return Get-YVectorView
}
function Get-YVectorTokens([string]$Text) {
    $matches = [regex]::Matches(([string]$Text).ToLowerInvariant(), '[\p{L}\p{N}][\p{L}\p{N}_-]*')
    $words = New-Object System.Collections.Generic.List[string]
    foreach ($m in $matches) {
        if ($m.Value.Length -lt 3) { continue }
        $words.Add([string]$m.Value)
        if ($words.Count -ge 180) { break }
    }
    return ,$words.ToArray()
}
function Get-YVectorDate($Item) {
    foreach ($key in @('t','created','updated')) {
        $value = [long](Get-YNum (Get-YValue $Item $key 0) 0)
        if ($value -gt 0) { return $value }
    }
    return 0L
}
function Get-YVectorEmotionTag($Evidence) {
    # Emotional context is derived only from the owner's quoted words.
    # This label is a conversational cue, never a diagnosis or verified mood.
    if ([string]$Evidence.origin -ne 'user_quote') { return '' }
    $quote = [string]$Evidence.quote
    if ($quote -match '(?i)радос|счастл|весел|довол') { return 'радость' }
    if ($quote -match '(?i)груст|печал|расстро|плохо') { return 'грусть' }
    if ($quote -match '(?i)устал|утомил') { return 'усталость' }
    if ($quote -match '(?i)люблю|дорог|нежн|близк') { return 'нежность' }
    if ($quote -match '(?i)тревог|волную|пережива') { return 'тревога' }
    return ''
}
function New-YVectorCandidate([string]$Space, $Ref, [string]$Text, [string]$Vec = '', [long]$Stamp = 0, [double]$Importance = 0.5) {
    if (-not $Text) { return $null }
    $id = [string](Get-YValue $Ref 'id' '')
    if (-not $id) { return $null }
    if ((Get-Command Test-YTopicVisible -ErrorAction SilentlyContinue) -and -not (Test-YTopicVisible $Text)) { return $null }
    $evidence = Get-YEvidence $Ref
    return @{
        id = $id; space = $Space; text = $Text; ref = $Ref
        vec = $Vec; t = $Stamp; importance = [Math]::Max(0, [Math]::Min(1, $Importance))
        evidence = $evidence; emotion = (Get-YVectorEmotionTag $evidence)
    }
}
function Get-YVectorCandidates {
    $out = New-Object System.Collections.Generic.List[object]
    foreach ($x in @($script:Chunks | Select-Object -Last 1400)) {
        $vec = $(if ([string]$script:DocsModel -eq [string]$script:Config.embeddingModel) { [string](Get-YValue $x 'vec' '') } else { '' })
        $c = New-YVectorCandidate 'document' $x ([string]$x.docName + ': ' + [string]$x.text) $vec (Get-YVectorDate $x) 0.6
        if ($null -ne $c) { $out.Add($c) }
    }
    foreach ($x in @($script:Memory | Select-Object -Last 800)) {
        $vec = $(if ([string]$script:MemoryModel -eq [string]$script:Config.embeddingModel) { [string](Get-YValue $x 'vec' '') } else { '' })
        $c = New-YVectorCandidate 'conversation' $x ([string]$x.text) $vec (Get-YVectorDate $x) 0.5
        if ($null -ne $c) { $out.Add($c) }
    }
    foreach ($x in @($script:Evo.facts | Select-Object -Last 350)) {
        if (@('active','unverified','needs-review') -notcontains [string]$x.status) { continue }
        $vec = $(if ([string]$x.vecModel -eq [string]$script:Config.embeddingModel) { [string]$x.vec } else { '' })
        $c = New-YVectorCandidate 'fact' $x ([string]$x.key + ': ' + [string]$x.value) $vec (Get-YVectorDate $x) ([double](Get-YNum $x.importance 0.7))
        if ($null -ne $c) { $out.Add($c) }
    }
    foreach ($x in @($script:Evo.episodes | Select-Object -Last 250)) {
        if ([string]$x.status -ne 'active') { continue }
        $vec = $(if ([string]$x.vecModel -eq [string]$script:Config.embeddingModel) { [string]$x.vec } else { '' })
        $c = New-YVectorCandidate 'episode' $x ([string]$x.title + ': ' + [string]$x.text) $vec (Get-YVectorDate $x) ([double](Get-YNum $x.importance 0.7))
        if ($null -ne $c) { $out.Add($c) }
    }
    if ($null -ne $script:SoulVecs) {
        foreach ($m in @(Get-YSoulMemories | Select-Object -Last 250)) {
            $vec = $(if ($script:SoulVecModel -eq [string]$script:Config.embeddingModel -and $script:SoulVecs.ContainsKey([string]$m.id)) { [string]$script:SoulVecs[[string]$m.id] } else { '' })
            $importance = $(if ($m.kind -eq 'moment') { 0.85 } else { 0.35 })
            $stamp = $(if ((Get-YVectorDate $m.ref) -gt 0) { Get-YVectorDate $m.ref } else { [long](Get-YNum (Get-YValue $m 't' 0) 0) })
            $c = New-YVectorCandidate 'soul' $m.ref ([string]$m.text) $vec $stamp $importance
            if ($null -ne $c) { $out.Add($c) }
        }
    }
    foreach ($pair in @(
        @{ space = 'attachment'; items = @($script:Y3.moments) },
        @{ space = 'preference'; items = @($script:Y3.preferences) },
        @{ space = 'correction'; items = @($script:Evo.corrections) + @($script:Y3.repairs) },
        @{ space = 'owner'; items = @($script:Und.map) },
        @{ space = 'note'; items = @($script:Notes) }
    )) {
        foreach ($x in @($pair.items | Select-Object -Last 180)) {
            $content = [string](Get-YValue $x 'text' (Get-YValue $x 'correct' ''))
            if ($pair.space -eq 'note') { $content = [string]$x.cat + ': ' + [string]$x.text }
            $c = New-YVectorCandidate ([string]$pair.space) $x $content '' (Get-YVectorDate $x) $(if ($pair.space -eq 'attachment' -or $pair.space -eq 'preference') { 0.85 } else { 0.65 })
            if ($null -ne $c) { $out.Add($c) }
        }
    }
    return ,$out.ToArray()
}
function Get-YVectorEvidenceScore($Evidence) {
    switch ([string]$Evidence.origin) {
        'user_manual' { return 1.0 }
        'user_quote' { return 0.80 }
        'document' { return 0.68 }
        'conversation' { return 0.60 }
        'assistant_generated' { return 0.35 }
        'assistant_hypothesis' { return 0.15 }
        'creative' { return 0.08 }
        default { return 0.25 }
    }
}
function Get-YVectorFeedbackBoost([string]$Space, [string]$Id) {
    $n = 0
    foreach ($f in $script:YVector.feedback) {
        if ([string]$f.space -eq $Space -and [string]$f.itemId -eq $Id) { $n += [int]$f.score }
    }
    return ([Math]::Max(-0.06, [Math]::Min(0.06, $n * 0.015)))
}
function Get-YVectorBM25([string[]]$QueryTerms, [string[]]$Terms, $DocumentFrequencies, [int]$CorpusSize, [double]$AverageLength) {
    if ($QueryTerms.Count -eq 0 -or $Terms.Count -eq 0) { return 0.0 }
    $counts = @{}
    foreach ($term in $Terms) { $counts[$term] = [int]$counts[$term] + 1 }
    $value = 0.0
    foreach ($term in @($QueryTerms | Select-Object -Unique)) {
        $tf = [double]$counts[$term]
        if ($tf -le 0) { continue }
        $df = [double]$DocumentFrequencies[$term]
        $idf = [Math]::Log(1 + ($CorpusSize - $df + 0.5) / ($df + 0.5))
        $value += $idf * (($tf * 2.2) / ($tf + 1.2 * (0.25 + 0.75 * $Terms.Count / [Math]::Max(1, $AverageLength))))
    }
    return $value
}
function Find-YVectorMatches([string]$Query, $QueryVec, [int]$Top = 10, [long]$Before = [long]::MaxValue) {
    $pool = @(Get-YVectorCandidates)
    if ($pool.Count -eq 0) { return ,@() }
    $queryTerms = @(Get-YVectorTokens $Query)
    $df = @{}
    $tokensById = @{}
    $lengths = 0.0
    foreach ($c in $pool) {
        $tokens = @(Get-YVectorTokens ([string]$c.text))
        $key = [string]$c.space + ':' + [string]$c.id
        $tokensById[$key] = $tokens
        $lengths += $tokens.Count
        $seen = @{}
        foreach ($term in $tokens) {
            if (-not $seen.ContainsKey($term)) {
                $seen[$term] = $true
                $df[$term] = [int]$df[$term] + 1
            }
        }
    }
    $avg = $lengths / [Math]::Max(1, $pool.Count)
    $hits = New-Object System.Collections.Generic.List[object]
    $now = Get-YNow
    foreach ($c in $pool) {
        if ($c.space -eq 'conversation' -and $Before -ne [long]::MaxValue -and [long]$c.t -ge $Before -and [long]$c.t -gt 0) { continue }
        $score = -2.0
        if ($null -ne $QueryVec -and $c.vec) {
            try { $score = [YaeriVec]::Dot($QueryVec, [YaeriVec]::Decode([string]$c.vec)) } catch { $score = -2.0 }
        }
        $key = [string]$c.space + ':' + [string]$c.id
        $bm = Get-YVectorBM25 $queryTerms $tokensById[$key] $df $pool.Count $avg
        $lex = 1.0 - [Math]::Exp(-$bm / 3.0)
        $semantic = [Math]::Max(0, $score)
        # BM25 rescues exact names and short terms missed by embeddings; no
        # lexical match + low cosine is deliberately excluded.
        if ($lex -le 0.0 -and $score -lt [double]$script:Config.minScore) { continue }
        if (-not $c.vec -and $lex -lt 0.14) { continue }
        $ageDays = $(if ([long]$c.t -gt 0) { [Math]::Max(0, ($now - [long]$c.t) / 86400000.0) } else { 365 })
        $freshness = [Math]::Exp(-$ageDays / 365)
        $evidence = Get-YVectorEvidenceScore $c.evidence
        $personal = $(if (@('attachment','preference','episode','owner','soul') -contains [string]$c.space) { 1.0 } else { 0.3 })
        $rank = 0.49 * $semantic + 0.25 * $lex
        if ($script:YVector.rerank) {
            $rank += 0.08 * $freshness + 0.06 * [double]$c.importance + 0.08 * $evidence + 0.04 * $personal
            $rank += Get-YVectorFeedbackBoost ([string]$c.space) ([string]$c.id)
        }
        # Only a quoted emotional term, never a model-inferred feeling, may
        # influence the tone match. Keep the evidence label visible in results.
        if ($c.emotion -and $Query -match '(?i)чувств|настроен|люб|радост|груст|устал|тревог|волн|отношен') {
            $rank += 0.025
        }
        if ([string]$c.evidence.origin -eq 'creative' -and $Query -notmatch '(?i)сон|мечт|истори|фантаз') { $rank *= 0.65 }
        $hits.Add([pscustomobject]@{
            Item = $c; Score = [Math]::Round($rank, 5); Semantic = [Math]::Round($semantic, 4)
            Lexical = [Math]::Round($lex, 4); Freshness = [Math]::Round($freshness, 4)
            EvidenceScore = [Math]::Round($evidence, 4); Associated = $false; Emotion = [string]$c.emotion
        })
    }
    # Expand up to two hops across previously indexed association links.
    # Linked items are only additional context, never evidence of causation.
    if ($script:YVector.associations -and $hits.Count -gt 0) {
        $seeds = @($hits | Sort-Object Score -Descending | Select-Object -First 4)
        $reachable = @{}
        foreach ($h in $seeds) { $reachable[[string]$h.Item.id] = @{ depth = 0; score = [double]$h.Score } }
        for ($depth = 1; $depth -le 2; $depth++) {
            foreach ($edge in @($script:Evo.links)) {
                $a = [string]$edge.from; $b = [string]$edge.to
                if ($reachable.ContainsKey($a) -and [int]$reachable[$a].depth -eq ($depth - 1) -and -not $reachable.ContainsKey($b)) {
                    $reachable[$b] = @{ depth = $depth; score = [double]$reachable[$a].score * 0.48 }
                }
                if ($reachable.ContainsKey($b) -and [int]$reachable[$b].depth -eq ($depth - 1) -and -not $reachable.ContainsKey($a)) {
                    $reachable[$a] = @{ depth = $depth; score = [double]$reachable[$b].score * 0.48 }
                }
            }
        }
        $indexed = @{}
        foreach ($h in $hits) { $indexed[[string]$h.Item.id] = $h }
        foreach ($c in $pool) {
            $id = [string]$c.id
            if (-not $reachable.ContainsKey($id) -or [int]$reachable[$id].depth -le 0) { continue }
            if ($indexed.ContainsKey($id)) {
                $indexed[$id].Score = [Math]::Round([double]$indexed[$id].Score + 0.025 / [double]$reachable[$id].depth, 5)
                $indexed[$id].Associated = $true
            } elseif ($hits.Count -lt 300 -and $c.space -in @('fact','episode')) {
                # Keep the weak second-hop weighting below direct evidence.
                $hits.Add([pscustomobject]@{
                    Item = $c; Score = [Math]::Round([double]$reachable[$id].score, 5)
                    Semantic = 0.0; Lexical = 0.0; Freshness = 0.0
                    EvidenceScore = (Get-YVectorEvidenceScore $c.evidence)
                    Associated = $true; Emotion = [string]$c.emotion
                })
                $indexed[$id] = $true
            }
        }
    }
    $sorted = @($hits | Sort-Object Score -Descending | Select-Object -First ([Math]::Max(1, [Math]::Min(40, $Top * 4))))
    # Collection balancing: a large document must not drown out all the
    # user's lived experience; keeps the best-ranked item per space first.
    $chosen = New-Object System.Collections.Generic.List[object]
    $spaces = @{}
    $seenContent = @{}
    foreach ($hit in $sorted) {
        $space = [string]$hit.Item.space
        # Non-destructive semantic consolidation during retrieval: suppress
        # identical texts (even across different sources) in the short context.
        $norm = (Get-YVectorFingerprint ([string]$hit.Item.text))
        if ($seenContent.ContainsKey($norm)) { continue }
        $cap = switch ($space) { 'document' { [Math]::Max(2, [int]($Top / 2)) } 'conversation' { 3 } default { 3 } }
        if ([int]$spaces[$space] -ge $cap) { continue }
        $chosen.Add($hit)
        $seenContent[$norm] = $true
        $spaces[$space] = [int]$spaces[$space] + 1
        if ($chosen.Count -ge $Top) { break }
    }
    return ,$chosen.ToArray()
}
function Add-YVectorFeedback([string]$ReplyId, [int]$Score, $Sources) {
    if (-not $script:YVector.enabled -or -not $ReplyId) { return }
    for ($i = $script:YVector.feedback.Count - 1; $i -ge 0; $i--) {
        if ([string]$script:YVector.feedback[$i].replyId -eq $ReplyId) { $script:YVector.feedback.RemoveAt($i) }
    }
    if ($Score -ne 0) {
        foreach ($source in @($Sources | Select-Object -First 12)) {
            $key = [string](Get-YValue $source 'vectorKey' '')
            if ($key -notmatch '^([a-z]+):([a-zA-Z0-9_-]{1,60})$') { continue }
            [void]$script:YVector.feedback.Add(@{
                replyId = $ReplyId; space = $Matches[1]; itemId = $Matches[2]
                score = $(if ($Score -gt 0) { 1 } else { -1 }); t = (Get-YNow)
            })
        }
    }
    Save-YVector
}
