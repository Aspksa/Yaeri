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
