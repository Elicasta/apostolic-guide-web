#!/usr/bin/env python3
"""Video Producer multicam wrapper. Single-camera projects stay on the proven finishing path."""
import importlib.util
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINISH_PATH = os.path.join(ROOT, "scripts", "render_video_producer_finishing_worker.py")
SPEC = importlib.util.spec_from_file_location("ag_finishing_worker", FINISH_PATH)
fw = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(fw)


def _segments_for_video(keep, decisions, cameras):
    camera_map = {item["id"]: item for item in cameras}
    pieces = []
    for kept in keep:
        start = float(kept["start"])
        end = float(kept["end"])
        boundaries = {start, end}
        for decision in decisions:
            ds, de = float(decision["start"]), float(decision["end"])
            if start < ds < end:
                boundaries.add(ds)
            if start < de < end:
                boundaries.add(de)
        points = sorted(boundaries)
        for index in range(len(points) - 1):
            left, right = points[index], points[index + 1]
            if right - left < 0.02:
                continue
            mid = (left + right) / 2
            source_id = "camera-a"
            for decision in decisions:
                if float(decision["start"]) <= mid < float(decision["end"]):
                    source_id = decision.get("sourceId") or "camera-a"
                    break
            camera = camera_map.get(source_id)
            if camera:
                offset = float(camera.get("offsetMs") or 0) / 1000.0
                duration = camera.get("duration")
                media_start, media_end = left - offset, right - offset
                if media_start >= 0 and (duration is None or media_end <= float(duration) + 0.03):
                    pieces.append((camera["inputIndex"], media_start, media_end))
                    continue
            pieces.append((0, left, right))
    return pieces


def _segments_for_audio(keep, external):
    pieces = []
    if not external:
        return [(0, float(item["start"]), float(item["end"])) for item in keep]
    offset = float(external.get("offsetMs") or 0) / 1000.0
    duration = float(external.get("duration") or 0)
    coverage_start, coverage_end = offset, offset + duration
    for kept in keep:
        start, end = float(kept["start"]), float(kept["end"])
        points = sorted({start, end, max(start, min(end, coverage_start)), max(start, min(end, coverage_end))})
        for index in range(len(points) - 1):
            left, right = points[index], points[index + 1]
            if right - left < 0.02:
                continue
            mid = (left + right) / 2
            if coverage_start <= mid < coverage_end:
                pieces.append((external["inputIndex"], left - offset, right - offset))
            else:
                pieces.append((0, left, right))
    return pieces


def build_ffmpeg_multicam(manifest, source, ass_file, output_file):
    multicam = manifest.get("multicam") or None
    if not multicam:
        return fw.build_ffmpeg_v2(manifest, source, ass_file, output_file)
    plan = manifest["renderPlan"]
    keep = plan.get("keepSegments") or []
    if not keep:
        raise RuntimeError("render plan has no keep segments")
    if (manifest.get("source") or {}).get("range"):
        raise RuntimeError("multicam render does not support inherited source ranges")

    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y", "-i", source]
    cameras = []
    input_index = 1
    for camera in multicam.get("cameras") or []:
        local_path = camera.get("localPath")
        if not local_path:
            continue
        item = dict(camera)
        item["inputIndex"] = input_index
        cameras.append(item)
        command += ["-i", local_path]
        input_index += 1
    external = multicam.get("externalAudio")
    if external and external.get("localPath"):
        external = dict(external)
        external["inputIndex"] = input_index
        command += ["-i", external["localPath"]]
        input_index += 1
    else:
        external = None

    music_tracks = manifest.get("musicTracks") or []
    selected_music = music_tracks[0] if music_tracks else None
    music_index = None
    if selected_music and selected_music.get("localPath"):
        music_index = input_index
        command += ["-stream_loop", "-1", "-i", selected_music["localPath"]]

    mode = plan["mode"]
    graph = []
    video_labels = []
    video_pieces = _segments_for_video(keep, multicam.get("editDecisions") or [], cameras)
    for index, (source_index, start, end) in enumerate(video_pieces):
        if mode == "reels":
            normalize = "fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=fast_bilinear,crop=1080:1920,setsar=1"
        else:
            normalize = "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
        label = f"mv{index}"
        graph.append(f"[{source_index}:v]trim=start={start:.4f}:end={end:.4f},setpts=PTS-STARTPTS,{normalize}[{label}]")
        video_labels.append(f"[{label}]")
    if not video_labels:
        raise RuntimeError("no valid multicam video segments remained")
    graph.append("".join(video_labels) + f"concat=n={len(video_labels)}:v=1:a=0[vcat]")

    audio_labels = []
    for index, (source_index, start, end) in enumerate(_segments_for_audio(keep, external)):
        label = f"ma{index}"
        graph.append(f"[{source_index}:a]atrim=start={start:.4f}:end={end:.4f},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[{label}]")
        audio_labels.append(f"[{label}]")
    if not audio_labels:
        raise RuntimeError("no valid multicam audio segments remained")
    graph.append("".join(audio_labels) + f"concat=n={len(audio_labels)}:v=0:a=1[acat]")

    if mode == "reels":
        video_input = fw.append_reel_motion_graph(graph, plan)
        graph.append(f"[{video_input}]{fw.color_filter_v2(plan)},ass='{ass_file}'[vout]")
    else:
        graph.append(f"[vcat]{fw.color_filter_v2(plan)},ass='{ass_file}'[vout]")
    graph.append(f"[acat]{fw.audio_filter_v2(plan)}[voice]")

    audio_output = "voice"
    if music_index is not None and selected_music:
        gain_db = float(selected_music.get("gainDb", -28))
        output_duration = max(0.5, float(plan.get("outputDuration") or 0))
        fade_out = max(0.1, output_duration - 1.2)
        graph.append(f"[{music_index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume={gain_db}dB,afade=t=in:st=0:d=1.0,afade=t=out:st={fade_out:.3f}:d=1.2,atrim=0:{output_duration:.3f}[musicbed]")
        if bool(selected_music.get("duckUnderVoice", True)):
            graph.append("[voice]asplit=2[voice_sidechain][voice_mix]")
            graph.append("[musicbed][voice_sidechain]sidechaincompress=threshold=0.035:ratio=8:attack=15:release=350:makeup=1[ducked]")
            graph.append("[voice_mix][ducked]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.94[aout]")
        else:
            graph.append("[voice][musicbed]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.94[aout]")
        audio_output = "aout"

    command += ["-filter_complex", ";".join(graph), "-map", "[vout]", "-map", f"[{audio_output}]", "-c:v", "libx264", "-preset", "veryfast" if mode == "reels" else "medium", "-crf", "20" if mode == "reels" else "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-r", "30", output_file]
    return command


fw.bw.base.build_ffmpeg = build_ffmpeg_multicam
fw.bw.build_ffmpeg = build_ffmpeg_multicam


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_multicam_worker.py payload.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "source_url", "manifest_url", "output_upload_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    fw.bw.base.callback(payload, "rendering", 2, "Downloading render manifest")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-multicam-") as directory:
        manifest_path = os.path.join(directory, "manifest.json")
        source_path = os.path.join(directory, "source-video")
        ass_path = os.path.join(directory, "graphics.ass")
        main_path = os.path.join(directory, "main.mp4")
        fw.bw.base.download(payload["manifest_url"], manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        fw.bw.base.validate_manifest(manifest)
        fw.bw.base.callback(payload, "rendering", 6, "Downloading source media")
        fw.bw.base.download(payload["source_url"], source_path)

        multicam = manifest.get("multicam") or None
        if multicam:
            urls = {item.get("id"): item.get("url") for item in payload.get("camera_urls") or [] if item.get("id") and item.get("url")}
            for camera in multicam.get("cameras") or []:
                url = urls.get(camera.get("id"))
                if url:
                    local_path = os.path.join(directory, f"camera-{camera.get('id')}")
                    fw.bw.base.download(url, local_path)
                    camera["localPath"] = local_path
            external = multicam.get("externalAudio")
            if external and payload.get("external_audio_url"):
                local_path = os.path.join(directory, "external-audio")
                fw.bw.base.download(payload["external_audio_url"], local_path)
                external["localPath"] = local_path

        for index, track in enumerate(manifest.get("musicTracks") or []):
            if track.get("url"):
                local_path = os.path.join(directory, f"music-{index}")
                fw.bw.base.download(track["url"], local_path)
                track["localPath"] = local_path

        fw.bw.base.callback(payload, "rendering", 12, "Building Graphics V2 and camera timeline")
        fw.build_broadcast_ass_v2(manifest, ass_path)
        fw.bw.safe_progress_callback(payload, 18, "Encoding mastered video · estimating")
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
