#!/usr/bin/env python3
"""Copy a private reviewed Video Producer master into the existing Publisher bucket."""
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
            chunk = response.read(4 * 1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)


def upload(url, path):
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--request", "PUT",
        "--header", "content-type: video/mp4", "--upload-file", path, url
    ], check=True)


def callback(payload, status, error=None):
    body = json.dumps({
        "renderId": payload["job_id"],
        "token": payload["callback_token"],
        "status": status,
        "error": error
    }).encode("utf-8")
    request = urllib.request.Request(
        payload["callback_url"], data=body, method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-publisher-handoff"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: video_producer_publisher_handoff_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    for key in ["job_id", "source_url", "upload_url", "callback_url", "callback_token"]:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")
    with tempfile.TemporaryDirectory(prefix="ag-publisher-handoff-") as directory:
        master = os.path.join(directory, "master.mp4")
        print("Downloading private reviewed master…", flush=True)
        download(payload["source_url"], master)
        if not os.path.exists(master) or os.path.getsize(master) < 1024:
            raise RuntimeError("reviewed master download is empty")
        print(f"Copying {os.path.getsize(master) / 1024 / 1024:.1f} MiB into Publisher storage…", flush=True)
        upload(payload["upload_url"], master)
        callback(payload, "completed")
        print("Publisher handoff complete.", flush=True)


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
                print(f"publisher failure callback failed: {callback_error}", file=sys.stderr)
        raise
