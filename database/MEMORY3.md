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
