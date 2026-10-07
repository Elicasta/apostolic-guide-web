#!/usr/bin/env python3
"""Download one selected Visual Pass clip, normalize it, hash it, persist it, and report metadata.

This worker intentionally handles selected footage only. It is not a stock crawler or mirror.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request


def run(command):
    subprocess.run(command, check=True)


def callback(payload, status, percent, stage, error=None, output=None):
    body = {
        "jobId": payload["job_id"],
        "status": status,
        "percent": percent,
        "stage": stage,
    }
    if error:
        body["error"] = str(error)[:2000]
    if output:
        body["output"] = output
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        payload["callback_url"],
        data=data,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-video-producer-worker-token": payload["callback_token"],
            "user-agent": "apostolic-guide-video-producer-visual-worker",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        response.read()


def download(url, target):
    run(["curl", "--fail", "--location", "--silent", "--show-error", "--retry", "3", "--retry-delay", "2", "--output", target, url])


def probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        check=True,
        capture_output=True,
        text=True,
    )
    body = json.loads(result.stdout)
    video = next((stream for stream in body.get("streams", []) if stream.get("codec_type") == "video"), None)
    if not video:
        raise RuntimeError("selected visual has no video stream")
    duration = float(video.get("duration") or body.get("format", {}).get("duration") or 0)
    width = int(video.get("width") or 0)
    height = int(video.get("height") or 0)
    frame_rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    numerator, denominator = (frame_rate.split("/", 1) + ["1"])[:2]
    fps = float(numerator) / max(1.0, float(denominator))
    if duration <= 0 or width <= 0 or height <= 0:
        raise RuntimeError("selected visual metadata is incomplete")
    return {"duration": duration, "width": width, "height": height, "fps": fps}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_name(value):
    value = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(value or "visual")).strip("-._")
    return value[:100] or "visual"


def normalize(source, output, asset_in, desired_duration):
    metadata = probe(source)
    start = max(0.0, min(float(asset_in), max(0.0, metadata["duration"] - 0.25)))
    available = max(0.25, metadata["duration"] - start)
    duration = max(0.5, min(float(desired_duration), available))
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", f"{start:.4f}", "-i", source,
        "-t", f"{duration:.4f}",
        "-an",
        "-vf", "fps=30,scale=1920:1920:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output,
    ])
    final = probe(output)
    return start, min(start + final["duration"], metadata["duration"]), final


def upload(url, path):
    run([
        "curl", "--fail", "--silent", "--show-error", "--retry", "2",
        "-X", "PUT", "-H", "Content-Type: video/mp4", "--data-binary", f"@{path}", url
    ])


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: video_producer_visual_import_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "beat_id", "download_url", "output_upload_url", "output_path", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    with tempfile.TemporaryDirectory(prefix="ag-visual-import-") as directory:
        source = os.path.join(directory, "source")
        normalized = os.path.join(directory, "visual.mp4")
        callback(payload, "downloading", 8, "Downloading selected footage")
        download(payload["download_url"], source)
        if not os.path.exists(source) or os.path.getsize(source) < 1024:
            raise RuntimeError("provider download did not create a usable file")

        callback(payload, "normalizing", 32, "Normalizing Visual Pass clip")
        asset_in, asset_out, media = normalize(
            source,
            normalized,
            float(payload.get("asset_in") or 0),
            float(payload.get("desired_duration") or 4),
        )
        if not os.path.exists(normalized) or os.path.getsize(normalized) < 1024:
            raise RuntimeError("normalization did not create a usable MP4")

        callback(payload, "uploading", 78, "Saving selected footage to AG media storage")
        digest = sha256(normalized)
        upload(payload["output_upload_url"], normalized)
        provider = safe_name(payload.get("provider"))
        provider_id = safe_name(payload.get("provider_asset_id") or payload["job_id"][:8])
        callback(payload, "completed", 100, "Visual ready for editor review", output={
            "storageLocator": payload["output_path"],
            "filename": f"{provider}_{provider_id}.mp4",
            "mimeType": "video/mp4",
            "sizeBytes": os.path.getsize(normalized),
            "sha256": digest,
            "duration": media["duration"],
            "width": media["width"],
            "height": media["height"],
            "fps": media["fps"],
            "assetIn": asset_in,
            "assetOut": asset_out,
        })


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
                callback(payload, "failed", 100, "Visual import failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr, flush=True)
        raise
