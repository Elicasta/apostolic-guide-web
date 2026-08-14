#!/usr/bin/env python3
"""Render three deterministic YouTube thumbnail candidates from the real source video."""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request


def download(url, target):
    request = urllib.request.Request(url, headers={"User-Agent": "apostolic-guide-video-producer"})
    with urllib.request.urlopen(request, timeout=180) as response, open(target, "wb") as handle:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def upload(url, path):
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--request", "PUT",
        "--header", "content-type: image/jpeg", "--upload-file", path, url
    ], check=True)


def callback(payload, status, error=None):
    body = json.dumps({
        "projectId": payload["project_id"],
        "token": payload["callback_token"],
        "status": status,
        "error": error
    }).encode("utf-8")
    request = urllib.request.Request(
        payload["callback_url"], data=body, method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-thumbnail-worker"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def textfile(path, value):
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(" ".join(str(value or "").strip().split()).upper())


def draw_filter(variant, headline_file, pathway_file):
    common = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=contrast=1.055:saturation=1.03"
    headline = (
        f"drawtext=font='Bebas Neue':textfile='{headline_file}':reload=0:"
        "fontcolor=white:fontsize=112:line_spacing=4:borderw=0:shadowx=0:shadowy=0"
    )
    pathway = (
        f"drawtext=font='Montserrat':textfile='{pathway_file}':reload=0:"
        "fontcolor=white@0.78:fontsize=32:line_spacing=2"
    )
    if variant == "face-hook":
        return ",".join([
            common,
            "drawbox=x=0:y=0:w=860:h=1080:color=0x081522@0.88:t=fill",
            "drawbox=x=72:y=112:w=12:h=118:color=0xB3212D@1:t=fill",
            pathway + ":x=112:y=132",
            headline + ":x=112:y=310:box=0",
            "drawbox=x=112:y=760:w=180:h=8:color=0xB3212D@1:t=fill"
        ])
    if variant == "doctrine":
        return ",".join([
            common,
            "drawbox=x=0:y=660:w=1920:h=420:color=0x0E1E2D@0.94:t=fill",
            "drawbox=x=0:y=660:w=18:h=420:color=0xB3212D@1:t=fill",
            pathway + ":x=86:y=710",
            headline + ":x=86:y=800"
        ])
    return ",".join([
        common,
        "drawbox=x=0:y=0:w=1920:h=1080:color=0x0E1E2D@0.46:t=fill",
        "drawbox=x=126:y=154:w=1668:h=772:color=0x0E1E2D@0.58:t=fill",
        "drawbox=x=126:y=154:w=16:h=772:color=0xB3212D@1:t=fill",
        pathway + ":x=(w-text_w)/2:y=300",
        headline + ":x=(w-text_w)/2:y=455",
        "drawbox=x=(w-220)/2:y=700:w=220:h=8:color=0xB3212D@1:t=fill"
    ])


def render_variant(source, variant, headline, pathway, timestamp, output, directory):
    headline_file = os.path.join(directory, f"{variant}-headline.txt")
    pathway_file = os.path.join(directory, f"{variant}-pathway.txt")
    textfile(headline_file, headline)
    textfile(pathway_file, pathway)
    vf = draw_filter(variant, headline_file, pathway_file)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", f"{max(0, float(timestamp)):.3f}", "-i", source,
        "-frames:v", "1", "-vf", vf, "-q:v", "2", output
    ], check=True)
    if not os.path.exists(output) or os.path.getsize(output) < 1024:
        raise RuntimeError(f"thumbnail {variant} was not created")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: video_producer_thumbnail_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    for key in ["project_id", "source_url", "variants", "callback_url", "callback_token"]:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    with tempfile.TemporaryDirectory(prefix="ag-thumbnail-") as directory:
        source = os.path.join(directory, "source-video")
        download(payload["source_url"], source)
        source_offset = float(payload.get("source_range_start") or 0)
        pathway = payload.get("pathway_title") or "Apostolic Guide"
        for item in payload["variants"]:
            variant = item["variant"]
            output = os.path.join(directory, f"{variant}.jpg")
            timestamp = source_offset + float(item.get("sourceTimestamp") or 0)
            render_variant(source, variant, item.get("headline") or "Apostolic Guide", pathway, timestamp, output, directory)
            upload(item["outputUploadUrl"], output)
        callback(payload, "completed")


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) > 1:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload:
            try:
                callback(payload, "failed", str(error))
            except Exception as callback_error:
                print(f"thumbnail failure callback failed: {callback_error}", file=sys.stderr)
        raise
