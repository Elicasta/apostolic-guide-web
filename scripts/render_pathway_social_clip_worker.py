#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys
import tempfile
import urllib.request


def callback(payload: dict, status: str, error: str | None = None) -> None:
    body = {
        "clip_id": payload["clip_id"],
        "token": payload["callback_token"],
        "status": status,
    }
    if error:
        body["error"] = error[:2000]
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def render(payload: dict, output: Path) -> None:
    start = max(0.0, float(payload["start_seconds"]))
    end = float(payload["end_seconds"])
    duration = end - start
    if duration < 1.0:
        raise RuntimeError("Social clip duration is invalid.")

    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "source.mp4"
        urllib.request.urlretrieve(str(payload["source_url"]), source)
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-i", str(source),
            "-t", f"{duration:.3f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-c:v", "libx264", "-preset", "medium", "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(output),
        ], check=True)


def upload(payload: dict, output: Path) -> None:
    request = urllib.request.Request(
        payload["upload_url"],
        data=output.read_bytes(),
        method="PUT",
        headers={"Content-Type": "video/mp4", "x-upsert": "true"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        response.read()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render_pathway_social_clip_worker.py PAYLOAD_JSON OUTPUT_MP4", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text())
    output = Path(sys.argv[2])
    try:
        callback(payload, "rendering")
        render(payload, output)
        upload(payload, output)
        callback(payload, "completed")
        return 0
    except Exception as exc:
        try:
            callback(payload, "failed", str(exc))
        except Exception as callback_error:
            print(f"callback failed: {callback_error}", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
