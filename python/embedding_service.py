"""Loopback-only, persistent CPU embedding service. One JSON line in, one JSON line out."""
import argparse
import base64
from contextlib import closing
import hashlib
import heapq
import queue
import json
import os
import socketserver
import sqlite3
import struct
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL_DIR = ROOT / "models" / "multilingual-e5-small"
DB = ROOT.parent / "data" / "local-embeddings.sqlite3"
MODEL_ID = "intfloat/multilingual-e5-small"
_lock = threading.Lock()
_model = None
_index_queue = queue.Queue(maxsize=10000)


def vector(text):
    global _model
    if _model is None:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(str(MODEL_DIR), local_files_only=True, device="cpu")
    values = _model.encode([text], normalize_embeddings=True)[0].tolist()
    return base64.b64encode(struct.pack("<" + "f" * len(values), *values)).decode("ascii")


def embedding(text):
    key = hashlib.sha256((MODEL_ID + "\0" + text).encode("utf-8")).hexdigest()
    with _lock:
        DB.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(str(DB), timeout=10)) as db:
            db.execute("CREATE TABLE IF NOT EXISTS embeddings (key TEXT PRIMARY KEY, model TEXT NOT NULL, vector TEXT NOT NULL)")
            row = db.execute("SELECT vector FROM embeddings WHERE key=?", (key,)).fetchone()
            if row:
                return row[0]
            result = vector(text)
            db.execute("INSERT OR REPLACE INTO embeddings(key,model,vector) VALUES (?,?,?)", (key, MODEL_ID, result))
            db.commit()
            return result


def _index_worker():
    while True:
        item = _index_queue.get()
        try:
            item_id, text = item
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
            with closing(sqlite3.connect(str(DB), timeout=20)) as db:
                db.execute("CREATE TABLE IF NOT EXISTS semantic_index (id TEXT PRIMARY KEY, text_hash TEXT NOT NULL, vector TEXT NOT NULL)")
                existing = db.execute("SELECT text_hash FROM semantic_index WHERE id=?", (item_id,)).fetchone()
                if existing and existing[0] == digest:
                    continue
            encoded = embedding("passage: " + text)
            with closing(sqlite3.connect(str(DB), timeout=20)) as db:
                db.execute("INSERT OR REPLACE INTO semantic_index(id,text_hash,vector) VALUES (?,?,?)",
                           (item_id, digest, encoded))
                db.commit()
        except Exception as exc:
            print("indexing failed: " + str(exc), file=sys.stderr)
        finally:
            _index_queue.task_done()


def semantic_search(text, limit=32):
    encoded = embedding("query: " + text)
    raw = base64.b64decode(encoded)
    query = struct.unpack("<" + "f" * (len(raw) // 4), raw)
    results = []
    with closing(sqlite3.connect(str(DB), timeout=20)) as db:
        db.execute("CREATE TABLE IF NOT EXISTS semantic_index (id TEXT PRIMARY KEY, text_hash TEXT NOT NULL, vector TEXT NOT NULL)")
        for item_id, encoded_vector in db.execute("SELECT id,vector FROM semantic_index"):
            data = base64.b64decode(encoded_vector)
            if len(data) != len(raw):
                continue
            vec = struct.unpack("<" + "f" * len(query), data)
            score = sum(a * b for a, b in zip(query, vec))
            if len(results) < limit:
                heapq.heappush(results, (score, item_id))
            elif score > results[0][0]:
                heapq.heapreplace(results, (score, item_id))
    return [{"id": item_id, "score": round(score, 5)} for score, item_id in
            sorted(results, reverse=True)]


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(120)
        try:
            raw = self.rfile.readline(1048577)
            if len(raw) > 1048576:
                raise ValueError("request too large")
            req = json.loads(raw.decode("utf-8"))
            action = req.get("action", "embed")
            if req.get("model", MODEL_ID) != MODEL_ID:
                raise ValueError("unsupported model")
            if action == "index":
                items = req.get("items")
                if not isinstance(items, list) or len(items) > 64:
                    raise ValueError("invalid index batch")
                accepted = 0
                for item in items:
                    item_id, text = item.get("id"), item.get("text")
                    if not isinstance(item_id, str) or not 0 < len(item_id) <= 256:
                        continue
                    if not isinstance(text, str) or not 0 < len(text) <= 12000:
                        continue
                    try:
                        _index_queue.put_nowait((item_id, text))
                        accepted += 1
                    except queue.Full:
                        break
                result = {"accepted": accepted, "pending": _index_queue.qsize()}
            else:
                text = req.get("text")
                if not isinstance(text, str) or not 0 < len(text) <= 12000:
                    raise ValueError("invalid text")
                if action == "search":
                    result = {"results": semantic_search(text)}
                elif action == "embed":
                    result = {"vector": embedding(text)}
                else:
                    raise ValueError("unknown action")
        except Exception as exc:
            result = {"error": str(exc)}
        self.wfile.write((json.dumps(result, separators=(",", ":")) + "\n").encode("utf-8"))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        sys.exit("invalid port")
    threading.Thread(target=_index_worker, daemon=True).start()
    with Server(("127.0.0.1", args.port), Handler) as server:
        server.serve_forever()
