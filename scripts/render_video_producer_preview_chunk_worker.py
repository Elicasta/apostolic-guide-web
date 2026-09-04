#!/usr/bin/env python3
"""Render one short staging-proof window of an approved Video Producer manifest.

The hosted GitHub runner can be interrupted during long FFmpeg jobs. Preview renders
therefore divide the approved output timeline into short independent chunks. Each
chunk preserves source/cut timing, multicam offsets, graphics, captions, and Visual
Pass placements. Production/master rendering remains unchanged.
"""
from __future__ import annotations

import copy
import importlib.util
import json
import os
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


def callback(payload: dict, progress: int, stage: str) -> None:
    body = {
        "job_id": payload["job_id"],
        "token": payload["callback_token"],
        "status": "rendering",
        "progress": max(1, min(88, int(progress))),
        "stage": stage[:100],
    }
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-chunk"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status >= 300:
                raise RuntimeError(f"callback failed ({response.status})")
    except Exception as error:
        # Chunk heartbeats are best-effort. The assembly/failure job owns terminal state.
        print(f"preview chunk heartbeat failed: {error}", file=sys.stderr, flush=True)


def download_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"user-agent": "apostolic-guide-video-producer-chunk"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def clip_output_range(value: dict, window_start: float, window_end: float, source_shift: float) -> dict | None:
    output_start = float(value.get("outputStart") or 0)
    output_end = float(value.get("outputEnd") or output_start)
    start = max(window_start, output_start)
    end = min(window_end, output_end)
    if end - start <= 0.001:
        return None
    source_start = float(value.get("sourceStart") or 0) + (start - output_start)
    source_end = source_start + (end - start)
    result = dict(value)
    result.update({
        "sourceStart": source_start - source_shift,
        "sourceEnd": source_end - source_shift,
        "outputStart": start - window_start,
        "outputEnd": end - window_start,
    })
    return result


def slice_timed_items(items: list, window_start: float, window_end: float, source_shift: float) -> list:
    output = []
    for raw in items or []:
        item = copy.deepcopy(raw)
        ranges = []
        for value in item.get("outputRanges") or []:
            clipped = clip_output_range(value, window_start, window_end, source_shift)
            if clipped:
                ranges.append(clipped)
        if not ranges:
            continue
        item["outputRanges"] = ranges
        item["outputStart"] = ranges[0]["outputStart"]
        if "start" in item:
            item["start"] = float(item.get("start") or 0) - source_shift
        if "end" in item:
            item["end"] = float(item.get("end") or 0) - source_shift
        output.append(item)
    return output


def source_clips_for_window(keep_segments: list, window_start: float, window_end: float) -> list[dict]:
    cursor = 0.0
    clips = []
    for keep in keep_segments or []:
        source_start = float(keep.get("start") or 0)
        source_end = float(keep.get("end") or source_start)
        duration = max(0.0, source_end - source_start)
        output_start = cursor
        output_end = cursor + duration
        overlap_start = max(window_start, output_start)
        overlap_end = min(window_end, output_end)
        if overlap_end - overlap_start > 0.001:
            clips.append({
                "start": source_start + (overlap_start - output_start),
                "end": source_start + (overlap_end - output_start),
                "outputStart": overlap_start - window_start,
                "outputEnd": overlap_end - window_start,
            })
        cursor = output_end
    return clips


def shift_transcript(transcript: dict, source_shift: float, source_end: float) -> dict:
    value = copy.deepcopy(transcript or {})
    words = []
    for word in value.get("words") or []:
        start = float(word.get("start") or 0)
        end = float(word.get("end") or start)
        if end <= source_shift or start >= source_end:
            continue
        shifted = dict(word)
        shifted["start"] = max(0.0, start - source_shift)
        shifted["end"] = max(shifted["start"], end - source_shift)
        words.append(shifted)
    value["words"] = words
    segments = []
    for segment in value.get("segments") or []:
        start = float(segment.get("start") or 0)
        end = float(segment.get("end") or start)
        if end <= source_shift or start >= source_end:
            continue
        shifted = dict(segment)
        shifted["start"] = max(0.0, start - source_shift)
        shifted["end"] = max(shifted["start"], end - source_shift)
        segments.append(shifted)
    if "segments" in value:
        value["segments"] = segments
    return value


def slice_camera_ranges(ranges: list, window_start: float, window_end: float, source_shift: float) -> list:
    result = []
    for raw in ranges or []:
        output_start = float(raw.get("outputStart") or 0)
        output_end = float(raw.get("outputEnd") or output_start)
        clipped_output_start = max(window_start, output_start)
        clipped_output_end = min(window_end, output_end)
        if clipped_output_end - clipped_output_start <= 0.001:
            continue
        source_start = float(raw.get("start") or 0) + (clipped_output_start - output_start)
        source_end = source_start + (clipped_output_end - clipped_output_start)
        result.append({
            **raw,
            "start": source_start - source_shift,
            "end": source_end - source_shift,
            "outputStart": clipped_output_start - window_start,
            "outputEnd": clipped_output_end - window_start,
        })
    return result


def slice_visuals(visuals: dict, window_start: float, window_end: float, source_shift: float) -> dict:
    value = copy.deepcopy(visuals or {})
    placements = []
    for raw in value.get("placements") or []:
        item = copy.deepcopy(raw)
        placement = item.get("placement") or {}
        ranges = []
        for output_range in placement.get("outputRanges") or []:
            clipped = clip_output_range(output_range, window_start, window_end, source_shift)
            if clipped:
                ranges.append(clipped)
        if not ranges:
            continue
        placement["outputRanges"] = ranges
        # Keep the original placement anchor relative to the shifted source timeline.
        # It may be negative when the chunk begins in the middle of the placement;
        # that is intentional because assetIn + sourceStart - placementStart must stay exact.
        placement["sourceStart"] = float(placement.get("sourceStart") or 0) - source_shift
        placement["sourceEnd"] = float(placement.get("sourceEnd") or 0) - source_shift
        item["placement"] = placement
        placements.append(item)
    value["placements"] = placements
    return value


def slice_manifest(full: dict, window_start: float, window_end: float) -> tuple[dict, float, float]:
    manifest = copy.deepcopy(full)
    plan = manifest["renderPlan"]
    duration = float(plan.get("outputDuration") or 0)
    window_start = max(0.0, min(duration, window_start))
    window_end = max(window_start, min(duration, window_end))
    if window_end - window_start <= 0.01:
        raise RuntimeError("preview chunk window is empty")

    clips = source_clips_for_window(plan.get("keepSegments") or [], window_start, window_end)
    if not clips:
        raise RuntimeError("preview chunk has no kept source media")
    source_shift = min(item["start"] for item in clips)
    source_end = max(item["end"] for item in clips)
    source_span = max(0.01, source_end - source_shift)

    original_source = manifest.get("source") or {}
    original_range = original_source.get("range") or None
    global_base = float((original_range or {}).get("start") or 0)
    # The chunk worker seeks the remote source itself, so the sliced manifest sees a
    # local media file beginning at project-local source_shift.
    original_source["range"] = None
    manifest["source"] = original_source

    plan["sourceDuration"] = source_span
    plan["outputDuration"] = window_end - window_start
    plan["keepSegments"] = [
        {"start": item["start"] - source_shift, "end": item["end"] - source_shift}
        for item in clips
    ]
    plan["overlays"] = slice_timed_items(plan.get("overlays") or [], window_start, window_end, source_shift)
    plan["motion"] = slice_timed_items(plan.get("motion") or [], window_start, window_end, source_shift)
    plan["music"] = slice_timed_items(plan.get("music") or [], window_start, window_end, source_shift)
    plan["intro"] = False
    plan["outro"] = False
    manifest["transcript"] = shift_transcript(manifest.get("transcript") or {}, source_shift, source_end)

    multicam = manifest.get("multicam") or None
    if multicam:
        original_global_base = float(multicam.get("sourceRangeStart") or global_base)
        chunk_global_start = original_global_base + source_shift
        multicam["cameraRanges"] = slice_camera_ranges(
            multicam.get("cameraRanges") or [], window_start, window_end, source_shift
        )
        multicam["sourceRangeStart"] = 0.0
        for key in ("cameraB", "externalAudio"):
            media = multicam.get(key)
            if not media:
                continue
            original_offset = float(media.get("offsetSeconds") or 0)
            asset_seek = max(0.0, chunk_global_start - original_offset)
            media["inputSeekSeconds"] = asset_seek
            media["offsetSeconds"] = original_offset + asset_seek - chunk_global_start
        manifest["multicam"] = multicam

    if manifest.get("visuals"):
        manifest["visuals"] = slice_visuals(manifest["visuals"], window_start, window_end, source_shift)

    return manifest, global_base + source_shift, source_span


def inject_seek(command: list[str], input_value: str, seconds: float, duration: float | None = None) -> list[str]:
    if seconds <= 0.001 and not duration:
        return command
    result = list(command)
    for index in range(len(result) - 1):
        if result[index] == "-i" and result[index + 1] == input_value:
            options = []
            if seconds > 0.001:
                options += ["-ss", f"{seconds:.4f}"]
            if duration and duration > 0.01:
                options += ["-t", f"{duration:.4f}"]
            result[index:index] = options
            return result
    raise RuntimeError("could not locate media input for preview seek")


def prepare_remote_inputs(manifest: dict) -> None:
    multicam = manifest.get("multicam") or {}
    for key in ("cameraB", "externalAudio"):
        media = multicam.get(key)
        if media and media.get("url"):
            media["localPath"] = media["url"]
    for track in manifest.get("musicTracks") or []:
        if track.get("url"):
            track["localPath"] = track["url"]
    for item in ((manifest.get("visuals") or {}).get("placements") or []):
        asset = item.get("asset") or {}
        if asset.get("url"):
            asset["localPath"] = asset["url"]


def main() -> None:
    if len(sys.argv) != 6:
        raise SystemExit("usage: render_video_producer_preview_chunk_worker.py payload.json output.mp4 index start end")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    index = int(sys.argv[3])
    window_start = float(sys.argv[4])
    window_end = float(sys.argv[5])
    matrix = json.loads(str(payload.get("preview_matrix") or "[]"))
    count = max(1, len(matrix))
    callback(payload, 20, f"Rendering proof segment {index + 1}/{count}")

    full = download_json(payload["manifest_url"])
    manifest, source_seek, source_span = slice_manifest(full, window_start, window_end)
    prepare_remote_inputs(manifest)

    v3.STAGED_INSPECTION_ENCODE = True
    with tempfile.TemporaryDirectory(prefix=f"ag-preview-{index:03d}-") as directory:
        ass_path = os.path.join(directory, "graphics.ass")
        v3.build_graphics_ass(manifest, ass_path)
        v3.apply_staged_inspection_profile(manifest)
        command = v3.build_ffmpeg_v3(manifest, payload["source_url"], ass_path, sys.argv[2])
        command = inject_seek(command, payload["source_url"], source_seek, source_span + 0.75)

        multicam = manifest.get("multicam") or {}
        for key in ("cameraB", "externalAudio"):
            media = multicam.get(key)
            if media and media.get("url") and float(media.get("inputSeekSeconds") or 0) > 0.001:
                command = inject_seek(command, media["url"], float(media["inputSeekSeconds"]), source_span + 1.5)

        print(
            f"Video Producer preview chunk {index + 1}/{count}: "
            f"output {window_start:.2f}-{window_end:.2f}s, source seek {source_seek:.2f}s",
            flush=True,
        )
        subprocess.run(command, check=True)
        if not os.path.exists(sys.argv[2]) or os.path.getsize(sys.argv[2]) < 1024:
            raise RuntimeError("preview chunk render did not create usable media")
    callback(payload, 20, f"Proof segment {index + 1}/{count} ready")


if __name__ == "__main__":
    main()
