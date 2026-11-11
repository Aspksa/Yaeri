"""Loopback-only, persistent CPU embedding service. One JSON line in, one JSON line out."""
import argparse
import base64
import hashlib
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
        with sqlite3.connect(str(DB), timeout=10) as db:
            db.execute("CREATE TABLE IF NOT EXISTS embeddings (key TEXT PRIMARY KEY, model TEXT NOT NULL, vector TEXT NOT NULL)")
            row = db.execute("SELECT vector FROM embeddings WHERE key=?", (key,)).fetchone()
            if row:
                return row[0]
            result = vector(text)
            db.execute("INSERT OR REPLACE INTO embeddings(key,model,vector) VALUES (?,?,?)", (key, MODEL_ID, result))
            return result


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        self.request.settimeout(120)
        try:
            raw = self.rfile.readline(65537)
            if len(raw) > 65536:
                raise ValueError("request too large")
            req = json.loads(raw.decode("utf-8"))
            text = req.get("text")
            if not isinstance(text, str) or not 0 < len(text) <= 12000:
                raise ValueError("invalid text")
            if req.get("model", MODEL_ID) != MODEL_ID:
                raise ValueError("unsupported model")
            result = {"vector": embedding(text)}
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
    with Server(("127.0.0.1", args.port), Handler) as server:
        server.serve_forever()
