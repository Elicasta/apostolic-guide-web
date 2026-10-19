#!/usr/bin/env python3
"""Assemble independently rendered Video Producer staging-proof chunks."""
from __future__ import annotations

import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V3_PATH = os.path.join(ROOT, "scripts", "render_video_producer_visual_pass_worker.py")
SPEC = importlib.util.spec_from_file_location("ag_visual_pass_worker", V3_PATH)
v3 = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(v3)


def callback(payload: dict, status: str, progress: int, stage: str, error: str | None = None) -> None:
    body = {
        "job_id": payload["job_id"],
        "token": payload["callback_token"],
        "status": status,
        "progress": progress,
        "stage": stage[:100],
    }
    if error:
        body["error"] = error[:3000]
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-assemble"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback failed ({response.status})")


def download_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"user-agent": "apostolic-guide-video-producer-assemble"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def upload(url: str, path: str) -> None:
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--request", "PUT",
        "--header", "content-type: video/mp4", "--upload-file", path, url
    ], check=True)


def chunk_index(path: str) -> int:
    match = re.search(r"chunk-(\d+)\.mp4$", os.path.basename(path))
    if not match:
        raise RuntimeError(f"unexpected preview chunk filename: {path}")
    return int(match.group(1))


def find_chunks(root: str) -> list[str]:
    files = []
    for directory, _dirs, names in os.walk(root):
        for name in names:
            if re.fullmatch(r"chunk-\d+\.mp4", name):
                files.append(os.path.join(directory, name))
    return sorted(files, key=chunk_index)


def concat_chunks(chunks: list[str], target: str, directory: str) -> None:
    concat_file = os.path.join(directory, "chunks.txt")
    with open(concat_file, "w", encoding="utf-8") as handle:
        for path in chunks:
            escaped = os.path.abspath(path).replace("'", "'\\''")
            handle.write(f"file '{escaped}'\n")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-fflags", "+genpts", "-f", "concat", "-safe", "0", "-i", concat_file,
        "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "160k", "-af", "aresample=async=1:first_pts=0",
        "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", target
    ], check=True)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: assemble_video_producer_preview_worker.py payload.json chunks_dir output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    matrix = json.loads(str(payload.get("preview_matrix") or "[]"))
    expected = len(matrix)
    if expected <= 0:
        raise RuntimeError("preview matrix is empty")

    chunks = find_chunks(sys.argv[2])
    if len(chunks) != expected:
        raise RuntimeError(f"preview assembly expected {expected} chunks but found {len(chunks)}")
    indices = [chunk_index(path) for path in chunks]
    if indices != list(range(expected)):
        raise RuntimeError(f"preview chunks are incomplete or out of order: {indices}")

    callback(payload, "rendering", 90, "Joining proof segments")
    manifest = download_json(payload["manifest_url"])
    v3.STAGED_INSPECTION_ENCODE = True
    v3.apply_staged_inspection_profile(manifest)

    with tempfile.TemporaryDirectory(prefix="ag-preview-assembly-") as directory:
        main_file = os.path.join(directory, "joined.mp4")
        concat_chunks(chunks, main_file, directory)
        v3.fw.bw.package_with_bumpers(manifest, main_file, sys.argv[3], directory)
        if not os.path.exists(sys.argv[3]) or os.path.getsize(sys.argv[3]) < 1024:
            raise RuntimeError("preview assembly did not create usable media")

    callback(payload, "rendering", 96, "Uploading inspection proof")
    upload(payload["output_upload_url"], sys.argv[3])
    callback(payload, "completed", 100, "Ready to review")


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) >= 2:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload:
            try:
                callback(payload, "failed", 100, "Preview assembly failed", str(error))
            except Exception as callback_error:
                print(f"preview assembly failure callback failed: {callback_error}", file=sys.stderr, flush=True)
        raise
