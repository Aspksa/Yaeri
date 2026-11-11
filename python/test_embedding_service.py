import json
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
                with sqlite3.connect(str(service.DB)) as db:
                    self.assertEqual(db.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0], 1)

    def test_model_constant(self):
        self.assertEqual(service.MODEL_ID, "intfloat/multilingual-e5-small")


if __name__ == "__main__":
    unittest.main()
