# Required Python and Node.js runtimes

Yaeri now checks for **Python 3.9+** and **Node.js 18+** at startup, before starting its local HTTP server. Install both runtimes and ensure `python` and `node` are on `PATH`. Run `python --version` and `node --version` to verify.

The Windows PowerShell 5.1 launcher and existing API remain in place during the migration. These checks are the **first migration step**, not a claim that the API has already been rewritten in Node.js or that local embeddings are already computed in Python. Existing SQLite snapshots and memory formats remain unchanged. No Ollama or agents are required.

Next implementation steps: connect Python local embedding inference (model and tokenizer with a reproducible install), persist model-specific vectors, and move the HTTP boundary to Node.js with backward-compatible endpoints. Avoid downloading models without user consent.

## Automatic setup on launch

After Python 3.9+ and Node.js 18+ are installed and on PATH, `Yaeri.bat` automatically runs `python/bootstrap.py`. It installs missing `sentence-transformers` dependencies and downloads the default `intfloat/multilingual-e5-small` model to `python/models/multilingual-e5-small` on first launch. Later launches reuse these files. The model folder is excluded from Git.

The first launch needs internet access, enough disk space, and Python package installation permission. If setup fails, the launcher stops with an error rather than silently switching to a cloud embedding service. Local inference remains offline. The current launcher does **not** automatically install the Python or Node.js runtimes themselves, and Node.js is not yet the HTTP server.

## Automated runtime stack (2026-11)

`Yaeri.bat` now runs `launcher/bootstrap-runtimes.ps1` before starting. If Python 3.9+ or Node.js 18+ is missing, the installer attempts to install Python 3.11 and Node.js LTS through Windows `winget`. Windows App Installer/winget and internet access are needed for first-run provisioning. Windows may still prompt for elevation; installation is not guaranteed on locked-down machines.

The launcher starts a persistent, loopback-only Python embedding service and a Node.js HTTP frontend. Node receives browser traffic and proxies existing API and static routes to the private PowerShell HTTP backend, preserving current behavior. **API business logic is still implemented in PowerShell**; this is an HTTP frontend migration, not a complete rewrite. The Python service loads the local model on first inference, keeps it in memory, and stores embedding results in `data/local-embeddings.sqlite3`. It restarts automatically if the process exits. The database is a **vector cache** for queried passages, not yet a full precomputed corpus-wide ANN index. Current semantic reranking is still limited to a lexical shortlist of 32 results.

No Ollama, external embedding API, or agents are involved in the local semantic path. The first installation requires network access to obtain runtimes, Python packages, and model weights. Subsequent inference works offline once installed.

## Incremental corpus-wide semantic index

When `localSemantic=true`, Yaeri now submits eligible memory candidates to the persistent Python service in batches. The service indexes passage embeddings asynchronously in SQLite (`semantic_index` table) and searches across all **already indexed** records by cosine similarity. This can retrieve items with no shared query terms. A BM25 shortlist remains as a fallback while indexing catches up. On the first launch, indexing is progressive; complete semantic coverage is not immediate. The PowerShell side filters returned IDs against currently eligible memory candidates so deleted/retracted items are not exposed by stale index entries. The service uses a content hash to skip unchanged indexed passages.

## Native Node API migration checkpoint

`GET /api/runtime` (and `HEAD /api/runtime`) now executes directly in Node.js and reports only non-sensitive component roles and Node major version. All existing stateful API routes, including `/api/status`, continue to use the PowerShell backend unchanged. This endpoint is a migration/diagnostic checkpoint, **not** evidence that the rest of the API has been ported. Native static assets are already served by Node.js.

## Node API security boundary

Node now validates browser-facing API requests before forwarding them to PowerShell: cross-site fetches are denied, explicit Origin must match the local frontend host and port, and POST requests require JSON content type. The existing PowerShell validation remains active as defense in depth. The read-only `/api/runtime` endpoint is handled natively and does not access user data. Stateful API handlers remain in PowerShell pending a compatible storage migration.

## Private Node-to-PowerShell API channel

On each launch, PowerShell generates a fresh cryptographically random 256-bit token. The Node frontend receives it through its inherited environment and injects it into backend API requests. Node strips any browser-supplied copy of that header. The PowerShell API rejects requests without the correct token, preventing direct access to its separately bound loopback port. The token is not stored in the repository or persisted on disk. This hardens the staged migration; existing stateful routes still execute in PowerShell. This is process-local access control, not isolation against malicious software running as the same OS user.

## Native Node storage inspection

`GET /api/storage/health` and `HEAD /api/storage/health` inspect the on-disk JSON envelopes for notes, memory, history and documents without returning record contents. The response contains per-file `status` (`ok`, `missing`, `invalid`, or `unavailable`), record `count` when structurally valid, and format `version`. This endpoint is read-only: it never modifies files or bypasses PowerShell's in-memory state. Existing user-facing memory and settings APIs remain on PowerShell pending an atomic state migration. The diagnostic endpoint reflects disk snapshots and can briefly differ from in-memory state.
