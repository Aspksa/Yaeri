# Native SQLite integration

On Windows 10/11, the PowerShell launcher uses the built-in `winsqlite3.dll` directly. **No Python, Node, pip, or SQLite server is needed.**

- `launcher/yaeri-sqlite.ps1` provides the native SQLite bridge.
- `launcher/yaeri-api.ps1` now routes direct `data/*.json` snapshots through `data/yaeri.sqlite3`.
- Existing JSON snapshots are imported lazily when first read.
- After import, SQLite is the authoritative copy; JSON remains a compatibility backup written after each SQLite commit.
- Config files and API keys outside `data/` are never stored in this SQLite bridge.
- The existing PowerShell memory, RAG, personality and background modules keep their existing interfaces.
- A separate `database/schema.sql` describes structured tables for future normalized memory storage. Current runtime integration uses `json_snapshots` to avoid breaking existing data structures.

## Windows smoke test

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/sqlite-smoke.ps1
```

**Before upgrading:** back up the entire `data/` directory. Do not delete legacy JSON files. SQLite WAL files (`yaeri.sqlite3-wal`, `yaeri.sqlite3-shm`) are runtime data and must not be committed. For a consistent backup, stop Yaeri before copying `data/`.

**Limitations:** Windows-only native bridge; requires Windows SQLite DLL. This change does not yet convert individual memory records into the normalized `memories`/`embeddings` tables. It does not introduce agents. The Windows smoke test needs to be executed on a Windows machine.
