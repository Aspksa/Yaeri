"""SQLite persistence foundation for Yaeri. Python 3.9+ standard library only.

This module is an optional backend; the PowerShell launcher is not yet wired to it.
"""
from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path

SCHEMA = Path(__file__).with_name("schema.sql")
DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "yaeri.sqlite3"


class YaeriDB:
    def __init__(self, path: str | Path = DEFAULT_DB):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), timeout=15)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA busy_timeout=15000")
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.executescript(SCHEMA.read_text(encoding="utf-8"))
        self.conn.execute("INSERT OR IGNORE INTO schema_migrations(version) VALUES(1)")
        self.conn.commit()

    def close(self):
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def add_memory(self, content: str, kind: str = "fact", *,
                   source_type: str = "unverified", source_id: str | None = None,
                   confidence: float = 0.0, metadata: dict | None = None,
                   memory_id: str | None = None) -> str:
        if not content.strip():
            raise ValueError("Memory content cannot be empty")
        mid = memory_id or str(uuid.uuid4())
        with self.conn:
            self.conn.execute(
                """INSERT INTO memories(id,kind,content,source_type,source_id,confidence,metadata_json)
                   VALUES(?,?,?,?,?,?,?)""",
                (mid, kind, content, source_type, source_id, confidence,
                 json.dumps(metadata or {}, ensure_ascii=False)),
            )
        return mid

    def get_memory(self, memory_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
        return dict(row) if row else None

    def search_memories(self, query: str, limit: int = 10) -> list[dict]:
        # Keyword fallback; semantic search requires embeddings and a scoring adapter.
        if not query.strip():
            return []
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        rows = self.conn.execute(
            """SELECT * FROM memories WHERE content LIKE ? ESCAPE '\\'
               AND (expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
               ORDER BY updated_at DESC LIMIT ?""",
            (f"%{escaped}%", max(1, min(int(limit), 100))),
        ).fetchall()
        return [dict(row) for row in rows]

    def link_memories(self, from_id: str, to_id: str, relation: str, weight: float = 1.0):
        with self.conn:
            self.conn.execute(
                """INSERT INTO memory_links(from_id,to_id,relation,weight) VALUES(?,?,?,?)
                   ON CONFLICT(from_id,to_id,relation) DO UPDATE SET weight=excluded.weight""",
                (from_id, to_id, relation, weight),
            )

