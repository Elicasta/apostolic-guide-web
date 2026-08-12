#!/usr/bin/env python3
"""Render a Pathway video without exposing Supabase service credentials to GitHub.

The web app gives the worker a time-limited signed upload URL and a one-time
callback token. The worker renders locally, PUTs the finished MP4 to Storage,
and reports state and progress back to Apostolic Guide.
"""
from __future__ import annotations

from pathlib import Path
import json
import sys
import time
import urllib.request

from render_pathway_video_v2 import render


def post_callback(
    payload: dict,
    status: str,
    error: str | None = None,
    progress: int | None = None,
    stage: str | None = None,
) -> None:
    callback_url = str(payload.get("callback_url", "")).strip()
    callback_token = str(payload.get("callback_token", "")).strip()
    job_id = str(payload.get("job_id", "")).strip()
    if not callback_url or not callback_token or not job_id:
        raise RuntimeError("Render bridge callback details are missing.")

    body: dict[str, object] = {
        "job_id": job_id,
        "token": callback_token,
        "status": status,
    }
    if error:
        body["error"] = error[:1800]
    if progress is not None:
        body["progress"] = max(0, min(100, int(progress)))
    if stage:
        body["stage"] = stage[:80]

    request = urllib.request.Request(
        callback_url,
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "apostolic-guide-video-renderer",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def upload_render(payload: dict, output: Path) -> None:
    signed_url = str(payload.get("upload_url", "")).strip()
    if not signed_url:
        raise RuntimeError("Signed render upload URL is missing.")
    request = urllib.request.Request(
        signed_url,
        data=output.read_bytes(),
        method="PUT",
        headers={
            "Content-Type": "video/mp4",
            "x-upsert": "true",
            "User-Agent": "apostolic-guide-video-renderer",
        },
    )
    with urllib.request.urlopen(request, timeout=600) as response:
        response.read()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_pathway_video_worker.py payload.json output.mp4")

    payload = json.loads(Path(sys.argv[1]).read_text())
    output = Path(sys.argv[2])
    last_percent = -1
    last_stage = ""
    last_sent = 0.0

    def report(percent: int, stage: str) -> None:
        nonlocal last_percent, last_stage, last_sent
        now = time.monotonic()
        percent = max(0, min(100, int(percent)))
        should_send = stage != last_stage or percent >= last_percent + 2 or now - last_sent >= 4
        if not should_send:
            return
        try:
            post_callback(payload, "rendering", progress=percent, stage=stage)
            last_percent = percent
            last_stage = stage
            last_sent = now
        except Exception as callback_error:
            print(f"Progress callback failed; render will continue: {callback_error}", file=sys.stderr)

    try:
        report(1, "Starting renderer")
        render(payload, output, progress_callback=report)
        report(95, "Uploading MP4")
        upload_render(payload, output)
        report(99, "Finalizing")
        post_callback(payload, "completed", progress=100, stage="Ready")
        print(str(payload.get("public_url", "")))
    except Exception as exc:
        message = str(exc)
        try:
            post_callback(payload, "failed", message, progress=max(last_percent, 0), stage="Failed")
        except Exception as callback_error:
            print(f"Could not report failed render: {callback_error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
