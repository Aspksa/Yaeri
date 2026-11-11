"""One-time local inference setup, invoked by the Windows launcher."""
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = "intfloat/multilingual-e5-small"
MODEL_DIR = ROOT / "models" / "multilingual-e5-small"
READY = MODEL_DIR / "config.json"


def main():
    if importlib.util.find_spec("sentence_transformers") is None:
        print("Installing Python local inference dependencies...", flush=True)
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "-r", str(ROOT / "requirements-local.txt")])
    if not READY.is_file():
        print("Downloading multilingual embedding model (first run only)...", flush=True)
        from huggingface_hub import snapshot_download
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        snapshot_download(repo_id=MODEL, local_dir=str(MODEL_DIR))
        if not READY.is_file():
            raise RuntimeError("Model download did not produce config.json")
    print("Yaeri Python local model ready.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Yaeri setup failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
