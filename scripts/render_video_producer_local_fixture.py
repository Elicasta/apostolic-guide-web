#!/usr/bin/env python3
"""Render a local Visual Pass fixture without paid stock or generation providers.

The caller supplies a V3 manifest whose B-roll assets already point at local files.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_visual_pass_worker.py")
SPEC = importlib.util.spec_from_file_location("visual_pass_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


def render_manifest(manifest, output_path):
    source = ((manifest.get("source") or {}).get("localPath"))
    if not source or not os.path.isfile(source):
        raise RuntimeError("local fixture source video is missing")
    placements = ((manifest.get("visuals") or {}).get("placements") or [])
    if not placements:
        raise RuntimeError("local fixture has no B-roll placements")
    for item in placements:
        local_path = (item.get("asset") or {}).get("localPath")
        if not local_path or not os.path.isfile(local_path):
            raise RuntimeError("local fixture B-roll file is missing")

    with tempfile.TemporaryDirectory(prefix="ag-local-broll-") as directory:
        ass_path = os.path.join(directory, "graphics.ass")
        worker.validate_manifest_v3(manifest)
        worker.fw.build_broadcast_ass_v2(manifest, ass_path)
        command = worker.build_ffmpeg_v3(manifest, source, ass_path, output_path)
        command_text = " ".join(command)
        if "overlay=" not in command_text:
            raise RuntimeError("local fixture command is missing B-roll overlays")
        if "[1:a]" in command_text or "[2:a]" in command_text:
            raise RuntimeError("local B-roll audio leaked into the production mix")
        subprocess.run(command, check=True)
    if not os.path.isfile(output_path) or os.path.getsize(output_path) < 1024:
        raise RuntimeError("local fixture render did not produce a video")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_local_fixture.py manifest.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    render_manifest(manifest, sys.argv[2])
    print("Local Visual Pass fixture rendered.")


if __name__ == "__main__":
    main()
