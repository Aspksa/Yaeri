# Required Python and Node.js runtimes

Yaeri now checks for **Python 3.9+** and **Node.js 18+** at startup, before starting its local HTTP server. Install both runtimes and ensure `python` and `node` are on `PATH`. Run `python --version` and `node --version` to verify.

The Windows PowerShell 5.1 launcher and existing API remain in place during the migration. These checks are the **first migration step**, not a claim that the API has already been rewritten in Node.js or that local embeddings are already computed in Python. Existing SQLite snapshots and memory formats remain unchanged. No Ollama or agents are required.

Next implementation steps: connect Python local embedding inference (model and tokenizer with a reproducible install), persist model-specific vectors, and move the HTTP boundary to Node.js with backward-compatible endpoints. Avoid downloading models without user consent.

## Automatic setup on launch

After Python 3.9+ and Node.js 18+ are installed and on PATH, `Yaeri.bat` automatically runs `python/bootstrap.py`. It installs missing `sentence-transformers` dependencies and downloads the default `intfloat/multilingual-e5-small` model to `python/models/multilingual-e5-small` on first launch. Later launches reuse these files. The model folder is excluded from Git.

The first launch needs internet access, enough disk space, and Python package installation permission. If setup fails, the launcher stops with an error rather than silently switching to a cloud embedding service. Local inference remains offline. The current launcher does **not** automatically install the Python or Node.js runtimes themselves, and Node.js is not yet the HTTP server.
