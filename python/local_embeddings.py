"""Local embedding CLI. Input: one JSON object on stdin; output: base64 float32 JSON."""
import base64
import json
import os
import struct
import sys

DEFAULT_MODEL = "intfloat/multilingual-e5-small"


def embed(text, model_name=DEFAULT_MODEL):
    from sentence_transformers import SentenceTransformer

    # Offline after the model has been downloaded; no implicit network requests.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    model = SentenceTransformer(model_name, local_files_only=True, device="cpu")
    values = model.encode([text], normalize_embeddings=True)[0].tolist()
    return base64.b64encode(struct.pack("<" + "f" * len(values), *values)).decode("ascii")


def main():
    request = json.load(sys.stdin)
    text = request.get("text")
    model = request.get("model", DEFAULT_MODEL)
    if not isinstance(text, str) or not text or len(text) > 12000:
        raise ValueError("text must be 1..12000 characters")
    if not isinstance(model, str) or not model or ".." in model:
        raise ValueError("invalid model")
    print(json.dumps({"vector": embed(text, model)}, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Local embedding error: " + str(exc), file=sys.stderr)
        sys.exit(1)
