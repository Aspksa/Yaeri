# Memory 3.0 — retrieval safety increment

This increment builds on **existing Vector 2.0** hybrid BM25 + cosine ranking, fingerprint-based deduplication, association traversal, provenance, and review-only conflict diagnostics. Those features already existed and are not reimplemented here.

Changes:
- Expired records (`expiresAt`, Unix milliseconds) and records with `deleted`, `retracted`, `superseded`, `archived`, `rejected` or `expired` status are excluded from candidate retrieval.
- Provenance confidence, when supplied, is used as a bounded adjustment to evidence weighting; legacy unknown confidence remains unknown.
- Conflicting fact keys and values are compared after whitespace/case normalization; withdrawn facts do not trigger review.
- Diagnostic quality includes `memoryVersion: 3`; existing API keys remain compatible.
- No automatic deletion, merging, or truth arbitration. No agents.

Run the regression checks on Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/memory3-smoke.ps1
```

**Note:** This is a scoped Memory 3.0 increment, not a full new graph engine or normalized SQL migration. The existing SQLite integration continues to persist the application's JSON snapshots. Windows execution was not available in the authoring environment.

## Consolidation review (increment 2)

The existing Vector quality endpoint now exposes `quality.consolidation` and `quality.consolidationCount`. Groups are exact duplicates after case/whitespace normalization; each group retains the IDs, memory spaces, evidence origins, and source IDs of all originals. All groups are marked `review-only`.

No records are merged, deleted, promoted to verified facts, or changed automatically. Near-duplicates and contradictions remain separate review signals. This is an inspection capability, **not** automatic semantic consolidation.

## Multi-value conflict groups (increment 3)

The Vector quality endpoint additionally exposes `quality.conflictGroups` and `quality.conflictGroupCount`. Each group lists all distinct active normalized values for the same fact key, with the individual record IDs, source IDs, and evidence origins retained. Case/whitespace variants of the same value are not treated as conflicts. Withdrawn and expired records are excluded. Results are capped at 30 groups, sorted by key, and are review-only. The existing `quality.conflicts` field remains available for backward compatibility.

## Offline-only memory search

`POST /api/vector/search` now defaults to `localOnly: true`. The request does **not** generate query embeddings using Cloud.ru or another remote service. Retrieval uses the existing local BM25 token index and stored memories, followed by local evidence/recency reranking and association expansion. No Python, Node, or agent is needed.

Example request: `{"query":"что я говорил о проекте","localOnly":true}`.

To explicitly opt into the previous remote-query-embedding hybrid search, send `{"query":"...","localOnly":false}` with a configured API key. If no key is configured, lexical search still works.

The response includes `localOnly` and `mode` (`local-lexical-bm25` or `hybrid-local-rerank`).

**Scope:** This guarantee covers the memory-search endpoint only. It does not turn chat generation, embedding/index updates, or other Cloud.ru-dependent features into fully offline operations. Local search is lexical rather than semantic when no on-device embedding model is installed.

## Python local embeddings (migration increment)

Ollama integration was removed from the PowerShell vector search module. The previous PR left malformed PowerShell source; this increment replaces that entire section with valid functions.

Install Python dependencies: `python -m pip install sentence-transformers`. Download `intfloat/multilingual-e5-small` into the local Hugging Face cache once while online (for example, using `huggingface_hub.snapshot_download`). Runtime inference uses `local_files_only=True` and offline environment flags. Request `POST /api/vector/search` with `{"query":"что я люблю","localOnly":true,"localSemantic":true,"localModel":"intfloat/multilingual-e5-small"}`.

Python computes normalized CPU embeddings; PowerShell reranks up to 32 BM25 candidates and caches 512 vectors in memory. **Current limitation:** each uncached vector launches a Python process and loads the model, so first searches may be slow. This is not a full semantic index and the main HTTP API still runs in PowerShell. Node.js is required and executes a startup self-check, but it is not yet the HTTP server. No agents.
