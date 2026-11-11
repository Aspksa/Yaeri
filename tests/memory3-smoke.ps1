#requires -Version 5.1
# Windows: powershell -NoProfile -ExecutionPolicy Bypass -File tests/memory3-smoke.ps1
$ErrorActionPreference = 'Stop'
function Get-YNow { return 2000000000000L }
function Get-YNum($Value, $Default) { if ($null -eq $Value) { return $Default }; return [double]$Value }
function Test-YKey($Dict, [string]$Key) { return ($Dict -is [System.Collections.IDictionary] -and $Dict.Contains($Key)) }
function Get-YValue($Dict, [string]$Key, $Default) {
    if ((Test-YKey $Dict $Key) -and $null -ne $Dict[$Key]) { return $Dict[$Key] }
    return $Default
}
$script:DataDir = [System.IO.Path]::GetTempPath()
. (Join-Path $PSScriptRoot '../launcher/yaeri-vector.ps1')
. (Join-Path $PSScriptRoot '../launcher/yaeri-vector-index.ps1')
function Assert-Y([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
Assert-Y (Test-YMemory3Eligible @{status='active'} (Get-YNow)) 'Active record excluded'
Assert-Y (-not (Test-YMemory3Eligible @{status='retracted'} (Get-YNow))) 'Retracted record included'
Assert-Y (-not (Test-YMemory3Eligible @{status='active'; expiresAt=1999999999999L} (Get-YNow))) 'Expired record included'
Assert-Y (Test-YMemory3Eligible @{status='active'; expiresAt=2000000000001L} (Get-YNow)) 'Future record excluded'
Assert-Y ((Get-YMemory3NormalizedFact '  ПРИВЕТ   Мир ') -eq 'привет мир') 'Normalization failed'
$script:Evo = @{ facts = @(
    @{ id='a'; key='Город'; value='Москва'; status='active' },
    @{ id='b'; key=' город '; value='Казань'; status='active' },
    @{ id='c'; key='город'; value='Тула'; status='retracted' }
); events=@() }
$conflicts = @(Get-YVectorConflicts)
Assert-Y ($conflicts.Count -eq 1) 'Expected exactly one active conflict'
Assert-Y ($conflicts[0].status -eq 'needs-review') 'Conflict must require review'
$candidates = @(
    @{ id='one'; space='fact'; text='  ЯЭРИ   помнит  '; evidence=@{origin='user_manual';sourceId='a'} },
    @{ id='two'; space='conversation'; text='яэри помнит'; evidence=@{origin='conversation';sourceId='b'} },
    @{ id='three'; space='document'; text='другой текст'; evidence=@{origin='document';sourceId='c'} }
)
$review = @(Get-YMemory3ConsolidationReview $candidates)
Assert-Y ($review.Count -eq 1) 'Expected one consolidation group'
Assert-Y ($review[0].count -eq 2) 'Duplicate group must contain both records'
Assert-Y ($review[0].distinctOrigins.Count -eq 2) 'Provenance must be retained'
Assert-Y ($review[0].action -eq 'review-only') 'Consolidation must not auto-delete'
Assert-Y ($candidates.Count -eq 3) 'Original records must remain intact'
$groups = @(Get-YMemory3ConflictGroups @(
    @{ id='a'; key=' Город '; value='Москва'; status='active'; evidence=@{origin='user_manual';sourceId='owner'} },
    @{ id='b'; key='город'; value='Казань'; status='active'; evidence=@{origin='document';sourceId='doc-1'} },
    @{ id='c'; key='ГОРОД'; value='москва'; status='active'; evidence=@{origin='conversation';sourceId='chat-1'} },
    @{ id='d'; key='город'; value='Тула'; status='retracted' }
))
Assert-Y ($groups.Count -eq 1) 'Expected one conflict group'
Assert-Y ($groups[0].alternatives.Count -eq 2) 'Expected two distinct active values'
Assert-Y ($groups[0].action -eq 'review-only') 'Must not auto-resolve conflict'
$records = @($groups[0].alternatives | ForEach-Object { $_.records } | ForEach-Object { $_ })
Assert-Y ($records.Count -eq 3) 'All active sources must be preserved'
Assert-Y (@($records | Where-Object { $_.sourceId -eq 'doc-1' }).Count -eq 1) 'Document source lost'
# Offline contract: localOnly must not invoke the cloud embeddings function.
$script:cloudCalls = 0
function Test-YConfigured { return $true }
function Get-YEmbeddings([string[]]$Texts) { $script:cloudCalls++; throw 'Cloud access forbidden in offline test' }
function Get-YCleanLine([string]$Text, [int]$Max) { return $Text }
function Save-YVector { }
function Get-YEvidenceLabel($Item) { return 'local test' }
function Find-YVectorMatches([string]$Query, $QueryVec, [int]$Top = 10, [long]$Before = [long]::MaxValue) {
    Assert-Y ($null -eq $QueryVec) 'Offline query must not supply a remote embedding'
    return @()
}
$script:YVector = @{ enabled=$true; searches=0L; lastSearch=0L }
$result = Search-YVector @{ query='локальный поиск'; localOnly=$true }
Assert-Y ($script:cloudCalls -eq 0) 'Offline search invoked cloud embeddings'
Assert-Y ($result.mode -eq 'local-lexical-bm25') 'Offline search mode missing'
Assert-Y ($result.localOnly -eq $true) 'Offline flag missing'
$defaultResult = Search-YVector @{ query='локальный поиск' }
Assert-Y ($script:cloudCalls -eq 0) 'Default search invoked cloud embeddings'
Assert-Y ($defaultResult.localOnly -eq $true) 'Default search must be offline'
Write-Host 'Memory 3 smoke tests passed.' -ForegroundColor Green
