#!/usr/bin/env python3
"""Production wrapper that swaps Video Producer's placeholder ASS graphics for AG broadcast graphics."""
import importlib.util
import json
import os
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_WORKER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_worker.py")
SPEC = importlib.util.spec_from_file_location("video_producer_base_worker", BASE_WORKER_PATH)
base = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(base)

from video_producer_broadcast_graphics import build_broadcast_ass  # noqa: E402

# Keep the proven trim/audio/color/upload worker intact. Only replace the deterministic
# graphics compiler so rollout risk stays isolated to presentation.
base.build_ass = build_broadcast_ass


def main():
    base.main()


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) >= 2:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload and payload.get("callback_url") and payload.get("callback_token") and payload.get("job_id"):
            try:
                base.callback(payload, "failed", 100, "Render failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr)
        raise
