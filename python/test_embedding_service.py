import json
import base64
import struct
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import embedding_service as service


class ServiceTests(unittest.TestCase):
    def test_sqlite_cache_reuses_embedding(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(service, "DB", Path(folder) / "cache.sqlite3"), \
                 patch.object(service, "vector", return_value="fake-base64") as encode:
                self.assertEqual(service.embedding("query: hello"), "fake-base64")
                self.assertEqual(service.embedding("query: hello"), "fake-base64")
                encode.assert_called_once()
                with closing(sqlite3.connect(str(service.DB))) as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0], 1)

    def test_semantic_search_finds_indexed_item(self):
        def encode(text):
            values = (1.0, 0.0) if "query:" in text else (0.9, 0.1)
            return base64.b64encode(struct.pack("<ff", *values)).decode("ascii")
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(service, "DB", Path(folder) / "cache.sqlite3"), \
                 patch.object(service, "vector", side_effect=encode):
                service._index_queue.put(("fact:one", "a memory"))
                # Index one item synchronously without starting the daemon thread.
                item_id, text = service._index_queue.get_nowait()
                try:
                    vector = service.embedding("passage: " + text)
                    with closing(sqlite3.connect(str(service.DB))) as db:
                        db.execute("CREATE TABLE semantic_index (id TEXT PRIMARY KEY, text_hash TEXT NOT NULL, vector TEXT NOT NULL)")
                        db.execute("INSERT INTO semantic_index VALUES (?,?,?)", (item_id, "hash", vector))
                        db.commit()
                finally:
                    service._index_queue.task_done()
                result = service.semantic_search("question")
                self.assertEqual(result[0]["id"], "fact:one")

    def test_model_constant(self):
        self.assertEqual(service.MODEL_ID, "intfloat/multilingual-e5-small")


if __name__ == "__main__":
    unittest.main()
