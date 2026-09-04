#!/usr/bin/env python3
"""Video Producer V3 renderer.

Adds Visual Pass assembly media above the A-roll/multicam picture while preserving
A-roll/external master audio. Broadcast Graphics V2 and AG Kinetic Graphics are
applied after B-roll so Scripture, evidence, and motion typography stay on top.
"""
import importlib.util
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINISHING_PATH = os.path.join(ROOT, "scripts", "render_video_producer_finishing_worker.py")
SPEC = importlib.util.spec_from_file_location("ag_finishing_worker", FINISHING_PATH)
fw = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(fw)

from video_producer_kinetic_graphics import append_kinetic_graphics  # noqa: E402

ORIGINAL_BUILD = fw.build_ffmpeg_v2
ORIGINAL_VIDEO_NORMALIZE_CHAIN = fw.video_normalize_chain
ORIGINAL_APPEND_REEL_MOTION_GRAPH = fw.append_reel_motion_graph
STAGED_INSPECTION_ENCODE = False


def validate_manifest_v3(manifest):
    version = manifest.get("version")
    if version in (1, 2):
        fw.validate_manifest_v2(manifest)
        return
    if version != 3:
        raise RuntimeError("unsupported manifest version")
    legacy = dict(manifest)
    legacy["version"] = 2 if manifest.get("multicam") else 1
    fw.validate_manifest_v2(legacy)
    visuals = manifest.get("visuals") or {}
    if visuals.get("version") != 1 or not isinstance(visuals.get("placements"), list):
        raise RuntimeError("invalid Visual Pass manifest")
    if visuals.get("audioPolicy") != "a-roll-continues":
        raise RuntimeError("Visual Pass must preserve the production audio master")


def clamp(value, low, high):
    try:
        return min(high, max(low, float(value)))
    except (TypeError, ValueError):
        return low


def staged_dimensions(mode):
    return (360, 640) if mode == "reels" else (640, 360)


def staged_inspection_command(command):
    """Speed up only the isolated staging lane so hosted-runner previews finish quickly.

    The legacy finishing worker still contains one single-camera landscape geometry
    literal. Rewrite that literal here only for staging. Multicam and Reels geometry
    are handled by the staging wrappers installed below.
    """
    if not STAGED_INSPECTION_ENCODE:
        return command
    command = list(command)
    try:
        preset_index = command.index("-preset") + 1
        command[preset_index] = "ultrafast"
    except ValueError:
        pass
    try:
        crf_index = command.index("-crf") + 1
        command[crf_index] = "23"
    except ValueError:
        pass
    try:
        graph_index = command.index("-filter_complex") + 1
        graph = command[graph_index]
        graph = graph.replace(
            "scale=1920:1080:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black",
            "scale=640:360:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=640:360:(ow-iw)/2:(oh-ih)/2:black",
        )
        command[graph_index] = graph
    except ValueError:
        pass
    return command


def apply_staged_inspection_profile(manifest):
    """Downscale only staging proofs after ASS is authored at master coordinates.

    The ASS file is intentionally built before this mutation. That preserves the
    1920x1080/1080x1920 design coordinate system while libass scales it onto the
    small inspection frame. Production manifests are never changed.
    """
    if not STAGED_INSPECTION_ENCODE:
        return
    plan = manifest.get("renderPlan") or {}
    output = plan.get("output") or {}
    width, height = staged_dimensions(plan.get("mode"))
    output["width"], output["height"] = width, height
    print(f"Video Producer staged inspection resolution: {width}x{height}", flush=True)


def staging_video_normalize_chain(mode):
    """Give the finishing worker real low-resolution geometry during staging."""
    if not STAGED_INSPECTION_ENCODE:
        return ORIGINAL_VIDEO_NORMALIZE_CHAIN(mode)
    width, height = staged_dimensions(mode)
    if mode == "reels":
        ratio = width / height
        return (
            f"fps=30,crop=w='min(iw,ih*{ratio:.8f})':h=ih:"
            f"x='(iw-min(iw,ih*{ratio:.8f}))*0.5':y=0,"
            f"scale={width}:{height}:flags=fast_bilinear,setsar=1"
        )
    return (
        f"fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease:"
        f"flags=fast_bilinear,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    )


def staging_motion_crop(scale, fx, fy, width, height):
    crop_w = min(width, fw._even(width / scale))
    crop_h = min(height, fw._even(height / scale))
    max_x = max(0, width - crop_w)
    max_y = max(0, height - crop_h)
    x = fw._even(max_x * fx, 0) if max_x else 0
    y = fw._even(max_y * fy, 0) if max_y else 0
    x = min(max_x, max(0, x))
    y = min(max_y, max(0, y))
    return crop_w, crop_h, x, y


def staging_append_reel_motion_graph(graph, plan):
    """Preserve Reels punch-ins while rendering the staging proof at 360x640."""
    if not STAGED_INSPECTION_ENCODE:
        return ORIGINAL_APPEND_REEL_MOTION_GRAPH(graph, plan)
    output = plan.get("output") or {}
    width = int(output.get("width") or 360)
    height = int(output.get("height") or 640)
    ratio = width / height
    graph.append(
        f"[vcat]fps=30,crop=w='min(iw,ih*{ratio:.8f})':h=ih:"
        f"x='(iw-min(iw,ih*{ratio:.8f}))*0.5':y=0,"
        f"scale={width}:{height}:flags=fast_bilinear,setsar=1[vbase]"
    )
    intervals = fw.reel_motion_intervals(plan)
    if not intervals:
        return "vbase"
    if len(intervals) == 1:
        _start, _end, scale, fx, fy = intervals[0]
        if scale <= 1.001:
            return "vbase"
        crop_w, crop_h, x, y = staging_motion_crop(scale, fx, fy, width, height)
        graph.append(
            f"[vbase]crop={crop_w}:{crop_h}:{x}:{y},"
            f"scale={width}:{height}:flags=fast_bilinear,setsar=1[vmotion]"
        )
        return "vmotion"

    split_labels = "".join(f"[vm{i}]" for i in range(len(intervals)))
    graph.append(f"[vbase]split={len(intervals)}{split_labels}")
    segment_labels = []
    for index, (start, end, scale, fx, fy) in enumerate(intervals):
        chain = f"trim=start={start:.4f}:end={end:.4f},setpts=PTS-STARTPTS"
        if scale > 1.001:
            crop_w, crop_h, x, y = staging_motion_crop(scale, fx, fy, width, height)
            chain += (
                f",crop={crop_w}:{crop_h}:{x}:{y},"
                f"scale={width}:{height}:flags=fast_bilinear"
            )
        chain += ",setsar=1"
        label = f"vms{index}"
        graph.append(f"[vm{index}]{chain}[{label}]")
        segment_labels.append(f"[{label}]")
    graph.append("".join(segment_labels) + f"concat=n={len(segment_labels)}:v=1:a=0[vmotion]")
    return "vmotion"


# The finishing worker resolves these globals at render-command build time, so the
# wrappers preserve production behavior and only switch geometry when the allowlisted
# staging worker ref is active.
fw.video_normalize_chain = staging_video_normalize_chain
fw.append_reel_motion_graph = staging_append_reel_motion_graph


def visual_scale_chain(width, height, fit, scale):
    if fit == "contain":
        base = f"fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease:flags=fast_bilinear,setsar=1"
    else:
        base = f"fps=30,scale={width}:{height}:force_original_aspect_ratio=increase:flags=fast_bilinear,crop={width}:{height},setsar=1"
    visual_scale = clamp(scale, 0.25, 4.0)
    if abs(visual_scale - 1.0) <= 0.001:
        return base
    return (
        f"{base},scale=w='max(2,trunc(iw*{visual_scale:.6f}/2)*2)':"
        f"h='max(2,trunc(ih*{visual_scale:.6f}/2)*2)':flags=fast_bilinear,setsar=1"
    )


def build_ffmpeg_v3(manifest, source, ass_file, output_file):
    visuals = ((manifest.get("visuals") or {}).get("placements") or [])
    if not visuals:
        return staged_inspection_command(ORIGINAL_BUILD(manifest, source, ass_file, output_file))

    legacy = dict(manifest)
    legacy["version"] = 2 if manifest.get("multicam") else 1
    command = ORIGINAL_BUILD(legacy, source, ass_file, output_file)
    try:
        filter_flag = command.index("-filter_complex")
    except ValueError as error:
        raise RuntimeError("base Video Producer command has no filter graph") from error
    graph_index = filter_flag + 1
    graph = command[graph_index]

    # Remove the existing final ASS render. Visuals are composited first, then
    # the exact same Graphics/Kinetic ASS file is applied once at the top.
    replaced, count = re.subn(r",ass='[^']+'\[vout\]", "[vpre]", graph, count=1)
    if count != 1:
        raise RuntimeError("could not locate final Graphics V2 stage")
    graph = replaced

    input_count = sum(1 for value in command[:filter_flag] if value == "-i")
    extra_inputs = []
    input_by_asset = {}
    for item in visuals:
        asset = item.get("asset") or {}
        asset_id = str(asset.get("id") or "")
        local_path = asset.get("localPath")
        if not asset_id or not local_path:
            raise RuntimeError("Visual Pass asset is missing local media")
        if asset_id not in input_by_asset:
            input_by_asset[asset_id] = input_count + len(input_by_asset)
            extra_inputs += ["-i", local_path]
    command[filter_flag:filter_flag] = extra_inputs
    graph_index += len(extra_inputs)

    pieces = [graph]
    current = "vpre"
    segment_index = 0
    ordered = sorted(
        visuals,
        key=lambda value: (
            int((value.get("placement") or {}).get("layer") or 2),
            float((value.get("placement") or {}).get("sourceStart") or 0)
        )
    )
    output = (manifest.get("renderPlan") or {}).get("output") or {}
    output_width = int(output.get("width") or 1920)
    output_height = int(output.get("height") or 1080)
    for item in ordered:
        placement = item.get("placement") or {}
        asset = item.get("asset") or {}
        input_index = input_by_asset[str(asset.get("id"))]
        ranges = placement.get("outputRanges") or []
        fit = placement.get("fit") or "cover"
        position_x = clamp(placement.get("positionX", 0.5), 0.0, 1.0)
        position_y = clamp(placement.get("positionY", 0.5), 0.0, 1.0)
        scale = clamp(placement.get("scale", 1.0), 0.25, 4.0)
        for visible in ranges:
            output_start = float(visible.get("outputStart") or 0)
            output_end = float(visible.get("outputEnd") or output_start)
            if output_end - output_start < 0.05:
                continue
            source_start = float(visible.get("sourceStart") or placement.get("sourceStart") or 0)
            placement_start = float(placement.get("sourceStart") or 0)
            asset_start = max(0.0, float(placement.get("assetIn") or 0) + source_start - placement_start)
            asset_end = asset_start + (output_end - output_start)
            visual_label = f"agvis{segment_index}"
            overlay_label = f"agvo{segment_index}"
            chain = visual_scale_chain(output_width, output_height, fit, scale)
            pieces.append(
                f"[{input_index}:v]trim=start={asset_start:.4f}:end={asset_end:.4f},"
                f"setpts=PTS-STARTPTS+{output_start:.4f}/TB,{chain}[{visual_label}]"
            )
            pieces.append(
                f"[{current}][{visual_label}]overlay="
                f"x='(W-w)*{position_x:.6f}':y='(H-h)*{position_y:.6f}':"
                f"enable='between(t,{output_start:.4f},{output_end:.4f})':"
                f"eof_action=pass:shortest=0[{overlay_label}]"
            )
            current = overlay_label
            segment_index += 1

    pieces.append(f"[{current}]ass='{ass_file}'[vout]")
    command[graph_index] = ";".join(pieces)
    return staged_inspection_command(command)


fw.bw.base.build_ffmpeg = build_ffmpeg_v3
fw.bw.build_ffmpeg = build_ffmpeg_v3
fw.build_ffmpeg_v2 = build_ffmpeg_v3


def build_graphics_ass(manifest, target):
    """Render normal Broadcast Graphics once, then append Kinetic Graphics.

    Kinetic cues are filtered out of V2 first so the legacy generic-card fallback
    cannot double-render them. The dedicated kinetic renderer then owns the full
    text-hit -> animated-card transition using AG colors.
    """
    graphics_manifest = dict(manifest)
    graphics_plan = dict(manifest.get("renderPlan") or {})
    graphics_plan["overlays"] = [
        cue for cue in (graphics_plan.get("overlays") or []) if cue.get("kind") != "kinetic"
    ]
    graphics_manifest["renderPlan"] = graphics_plan
    fw.build_broadcast_ass_v2(graphics_manifest, target)
    return append_kinetic_graphics(manifest, target)


def main():
    global STAGED_INSPECTION_ENCODE
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_visual_pass_worker.py payload.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "source_url", "manifest_url", "output_upload_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    STAGED_INSPECTION_ENCODE = payload.get("worker_ref") == "codex/video-producer"
    if STAGED_INSPECTION_ENCODE:
        print("Video Producer staged inspection encode: 640x360/360x640 · libx264 ultrafast / CRF 23", flush=True)

    fw.bw.base.callback(payload, "rendering", 2, "Downloading render manifest")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-v3-") as directory:
        manifest_path = os.path.join(directory, "manifest.json")
        source_path = os.path.join(directory, "source-video")
        ass_path = os.path.join(directory, "graphics.ass")
        main_path = os.path.join(directory, "main.mp4")

        fw.bw.base.download(payload["manifest_url"], manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        validate_manifest_v3(manifest)

        fw.bw.base.callback(payload, "rendering", 6, "Downloading source video")
        fw.bw.base.download(payload["source_url"], source_path)

        multicam = manifest.get("multicam") or {}
        camera_b = multicam.get("cameraB") or None
        if camera_b and camera_b.get("url"):
            local_path = os.path.join(directory, "camera-b")
            fw.bw.base.download(camera_b["url"], local_path)
            camera_b["localPath"] = local_path
        external = multicam.get("externalAudio") or None
        if external and external.get("url"):
            local_path = os.path.join(directory, "external-audio")
            fw.bw.base.download(external["url"], local_path)
            external["localPath"] = local_path

        tracks = manifest.get("musicTracks") or []
        for index, track in enumerate(tracks):
            if not track.get("url"):
                continue
            local_path = os.path.join(directory, f"music-{index}")
            fw.bw.base.download(track["url"], local_path)
            track["localPath"] = local_path

        visuals = ((manifest.get("visuals") or {}).get("placements") or [])
        unique_assets = {}
        for item in visuals:
            asset = item.get("asset") or {}
            asset_id = str(asset.get("id") or "")
            if asset_id and asset_id not in unique_assets:
                unique_assets[asset_id] = asset
        for index, asset in enumerate(unique_assets.values()):
            if not asset.get("url"):
                raise RuntimeError("Visual Pass asset has no signed download URL")
            local_path = os.path.join(directory, f"visual-{index}.mp4")
            fw.bw.base.download(asset["url"], local_path)
            asset["localPath"] = local_path

        fw.bw.base.callback(payload, "rendering", 12, "Building Visual Pass + AG Kinetic Graphics")
        kinetic_count = build_graphics_ass(manifest, ass_path)
        apply_staged_inspection_profile(manifest)
        stage = "Encoding A-roll + B-roll + kinetic assembly · estimating" if kinetic_count else "Encoding A-roll + B-roll assembly · estimating"
        fw.bw.safe_progress_callback(payload, 18, stage)
        fw.bw.run_main_render_with_progress(payload, manifest, source_path, ass_path, main_path)
        if not os.path.exists(main_path) or os.path.getsize(main_path) < 1024:
            raise RuntimeError("FFmpeg completed without a usable main render")

        fw.bw.base.callback(payload, "rendering", 89, "Building timestamp-safe package")
        fw.bw.package_with_bumpers(manifest, main_path, sys.argv[2], directory)
        if not os.path.exists(sys.argv[2]) or os.path.getsize(sys.argv[2]) < 1024:
            raise RuntimeError("Video Producer package did not create a usable output file")

        fw.bw.base.callback(payload, "rendering", 94, "Uploading finished master")
        fw.bw.base.upload_file(payload["output_upload_url"], sys.argv[2])
        fw.bw.base.callback(payload, "completed", 100, "Ready to review")


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
                fw.bw.base.callback(payload, "failed", 100, "Render failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr, flush=True)
        raise
