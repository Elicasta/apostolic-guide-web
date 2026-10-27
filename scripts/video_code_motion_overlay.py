#!/usr/bin/env python3
"""Composite frame-exact Chromium scene plates above the mastered source video."""
import json
import os
import subprocess
import time


def _run_with_heartbeat(command, payload, callback, stage, directory):
    log_path = os.path.join(directory, "motion-render.log")
    with open(log_path, "w", encoding="utf-8") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
        last = 0.0
        while process.poll() is None:
            if time.monotonic() - last > 25:
                callback(payload, "rendering", 88, stage)
                last = time.monotonic()
            time.sleep(1)
        if process.returncode:
            with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
                tail = handle.read()[-5000:]
            raise RuntimeError(f"{stage} failed (exit {process.returncode}): {tail}")


def composite_video_code_scenes(manifest, source_path, tempdir, payload, callback):
    doc = manifest.get("videoCodeV2")
    if not doc or not doc.get("scenes"):
        return source_path
    output = manifest.get("renderPlan", {}).get("output", {})
    width, height, fps = int(output.get("width") or 0), int(output.get("height") or 0), int(output.get("fps") or 0)
    fmt = doc.get("format") or {}
    if (width, height, fps) != (fmt.get("w"), fmt.get("h"), fmt.get("fps")) or fps != 30:
        raise RuntimeError("Video Code scene format disagrees with approved Producer master")
    duration = float(manifest.get("renderPlan", {}).get("outputDuration") or 0)
    if not 0 < duration <= 7200:
        raise RuntimeError("Invalid video scene duration")
    scene_path = os.path.join(tempdir, "video-code-v2.json")
    frame_dir = os.path.join(tempdir, "scene-frames")
    os.mkdir(frame_dir)
    with open(scene_path, "w", encoding="utf-8") as handle:
        json.dump({"document": doc, "words": manifest.get("videoCodeWords") or [], "assetUrls": manifest.get("videoCodeAssetUrls") or {}}, handle, ensure_ascii=False)
    _run_with_heartbeat(
        ["node", "--import", "tsx", "scripts/video_code_render_frames.ts", scene_path, frame_dir, str(duration)],
        payload, callback, "Rendering browser scene plates", tempdir
    )
    rendered = os.path.join(tempdir, "main-motion.mp4")
    _run_with_heartbeat([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", source_path, "-framerate", str(fps), "-start_number", "0",
        "-i", os.path.join(frame_dir, "%06d.png"),
        "-filter_complex", "[0:v][1:v]overlay=0:0:shortest=1:format=auto,format=yuv420p[v]",
        "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast",
        "-crf", "18", "-c:a", "copy", "-movflags", "+faststart",
        "-t", str(duration), rendered
    ], payload, callback, "Compositing scene plates", tempdir)
    if not os.path.isfile(rendered) or os.path.getsize(rendered) < 1024:
        raise RuntimeError("Motion compositor produced no usable video")
    return rendered
