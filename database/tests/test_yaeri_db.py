import tempfile
import unittest
from pathlib import Path
from database.yaeri_db import YaeriDB


class DatabaseTests(unittest.TestCase):
    def test_memory_search_links_and_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "yaeri.sqlite3"
            with YaeriDB(path) as db:
                first = db.add_memory("Яэри помнит проект", source_type="user_quote", confidence=0.9)
                second = db.add_memory("Второе воспоминание", kind="episode")
                self.assertEqual(db.get_memory(first)["source_type"], "user_quote")
                self.assertEqual(len(db.search_memories("проект")), 1)
                self.assertEqual(len(db.search_memories("%")), 0)
                db.link_memories(first, second, "related")
                job = db.create_job("researcher", "Проверить память")
                db.add_agent_event(job, "started", {"ok": True})
                db.set_job_status(job, "completed", result={"count": 1})
                self.assertEqual(db.conn.execute(
                    "SELECT status FROM agent_jobs WHERE id=?", (job,)
                ).fetchone()[0], "completed")
                self.assertEqual(db.conn.execute(
                    "SELECT count(*) FROM memory_links"
                ).fetchone()[0], 1)
            with YaeriDB(path) as reopened:
                self.assertIsNotNone(reopened.get_memory(first))


if __name__ == "__main__":
    unittest.main()
