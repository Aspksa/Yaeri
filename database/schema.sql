PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('fact','episode','preference','conversation','reflection','document')),
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'unverified',
  source_id TEXT,
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json))
);
CREATE INDEX IF NOT EXISTS idx_memories_kind_updated ON memories(kind,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source_type,source_id);
CREATE TABLE IF NOT EXISTS embeddings (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK(dimensions > 0),
  vector BLOB NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(memory_id,model)
);
CREATE TABLE IF NOT EXISTS memory_links (
  from_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(from_id,to_id,relation),
  CHECK(from_id <> to_id)
);
