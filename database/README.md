# SQLite foundation (experimental)

This directory introduces an **optional** SQLite backend for Yaeri. It is **not yet connected** to the PowerShell launcher, so existing JSON data and Vector 2.0 remain unchanged.

## Requirements
- Python 3.9+ (standard library only; no pip packages)
- SQLite with JSON1 functions (included in modern Python builds)

## Quick test
Run from repository root:

```sh
python -m unittest discover -s database/tests -v
```

## Example
```python
from database.yaeri_db import YaeriDB

with YaeriDB() as db:
    memory_id = db.add_memory("Проект Яэри", source_type="user_manual", confidence=1)
    print(db.get_memory(memory_id))
```

The default database path is `data/yaeri.sqlite3`. Add `*.sqlite3`, `*.sqlite3-wal`, and `*.sqlite3-shm` to your local Git ignore rules if not already ignored.

## Schema
- `memories`: content, provenance, confidence, timestamps, JSON metadata
- `embeddings`: float32 vector bytes and model identity (storage only)
- `memory_links`: graph edges between memories
- `schema_migrations`: migration version registry

SQLite is configured for WAL, foreign keys, and a 15-second busy timeout. SQL uses parameters. Semantic ranking, JSON-to-SQLite migration, and PowerShell integration are **future work**; do not delete the existing JSON files.
