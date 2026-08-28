#!/usr/bin/env python3
"""Video Producer finishing worker: Graphics V2, mastering, AG music, and optional synchronized multicam."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROADCAST_PATH = os.path.join(ROOT, "scripts", "render_video_producer_broadcast_worker.py")
SPEC = importlib.util.spec_from_file_location("ag_broadcast_worker", BROADCAST_PATH)
bw = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(bw)

from video_producer_broadcast_graphics_v2 import build_broadcast_ass_v2  # noqa: E402

bw.build_broadcast_ass = build_broadcast_ass_v2
bw.base.build_ass = build_broadcast_ass_v2


def validate_manifest_v2(manifest):
    version = manifest.get("version")
    if version not in (1, 2):
        raise RuntimeError("unsupported manifest version")
    legacy = dict(manifest)
    legacy["version"] = 1
    bw.base.validate_manifest(legacy)
    if version == 2:
        multicam = manifest.get("multicam") or {}
        if multicam.get("version") != 1:
            raise RuntimeError("invalid multicam manifest")
        if not isinstance(multicam.get("cameraRanges"), list):
            raise RuntimeError("multicam camera ranges are missing")


def color_filter_v2(plan):
    preset = plan.get("colorPreset") or "none"
    if preset == "ag-studio":
        return "eq=contrast=1.065:saturation=1.02:brightness=-0.004:gamma=0.995,colorbalance=rm=-0.012:gm=-0.004:bm=0.012"
    if preset == "ag-warm":
        return "eq=contrast=1.055:saturation=1.035:brightness=-0.002:gamma=0.998,colorbalance=rm=0.010:gm=-0.004:bm=-0.010"
    if preset == "ag-clean":
        return "eq=contrast=1.045:saturation=1.02:brightness=-0.002:gamma=0.998,colorbalance=rm=-0.006:gm=-0.004:bm=0.008"
    return "null"


def audio_filter_v2(plan):
    preset = plan.get("audioPreset") or "none"
    tail = "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    if preset == "ag-voice-punch":
        return (
            "highpass=f=80,"
            "equalizer=f=260:t=q:w=1:g=-1.5,"
            "equalizer=f=3600:t=q:w=1:g=1.4,"
            "deesser=i=0.14:m=0.5:f=0.5,"
            "acompressor=threshold=-22dB:ratio=3.0:attack=8:release=125:makeup=1.5,"
            "alimiter=limit=0.94,loudnorm=I=-14:TP=-1:LRA=6," + tail
        )
    if preset == "ag-voice-clean":
        return (
            "highpass=f=70,"
            "equalizer=f=260:t=q:w=1:g=-1.8,"
            "equalizer=f=3600:t=q:w=1:g=1.0,"
            "deesser=i=0.12:m=0.5:f=0.5,"
            "acompressor=threshold=-21dB:ratio=2.4:attack=12:release=160:makeup=1.2,"
            "alimiter=limit=0.94,loudnorm=I=-16:TP=-1.5:LRA=7," + tail
        )
    return tail


bw.base.color_filter = color_filter_v2
bw.base.audio_filter = audio_filter_v2


def _clamp(value, low, high):
    return min(high, max(low, value))


def _even(value, minimum=2):
    return max(minimum, int(round(float(value) / 2.0) * 2))


def reel_motion_intervals(plan):
    duration = max(0.0, float(plan.get("outputDuration") or 0))
    if duration <= 0:
        return []
    cues = []
    for cue in plan.get("motion") or []:
        if cue.get("kind") not in ("punch-in", "reframe", "emphasis"):
            continue
        transform = cue.get("transform") or {}
        scale = _clamp(float(transform.get("scale") or (1.08 if cue.get("kind") == "punch-in" else 1.0)), 1.0, 1.35)
        fx = _clamp(float(transform.get("focusX") or 0.5), 0.0, 1.0)
        fy = _clamp(float(transform.get("focusY") or 0.5), 0.0, 1.0)
        if scale <= 1.001:
            continue
        for visible in cue.get("outputRanges") or []:
            start = _clamp(float(visible.get("outputStart", 0)), 0.0, duration)
            end = _clamp(float(visible.get("outputEnd", start)), start, duration)
            if end - start >= 0.08:
                cues.append((start, end, scale, fx, fy))
    cues = sorted(cues, key=lambda item: (item[0], item[1]))[:24]
    if not cues:
        return [(0.0, duration, 1.0, 0.5, 0.5)]

    boundaries = {0.0, duration}
    for start, end, _scale, _fx, _fy in cues:
        boundaries.add(start)
        boundaries.add(end)
    points = sorted(boundaries)
    intervals = []
    for index in range(len(points) - 1):
        start, end = points[index], points[index + 1]
        if end - start < 0.001:
            continue
        midpoint = (start + end) / 2
        active = [cue for cue in cues if cue[0] <= midpoint < cue[1]]
        if active:
            chosen = max(active, key=lambda item: item[2])
            intervals.append((start, end, chosen[2], chosen[3], chosen[4]))
        else:
            intervals.append((start, end, 1.0, 0.5, 0.5))
    return intervals


def motion_crop(scale, fx, fy):
    crop_w = min(1080, _even(1080 / scale))
    crop_h = min(1920, _even(1920 / scale))
    max_x = max(0, 1080 - crop_w)
    max_y = max(0, 1920 - crop_h)
    x = _even(max_x * fx, 0) if max_x else 0
    y = _even(max_y * fy, 0) if max_y else 0
    x = min(max_x, max(0, x))
    y = min(max_y, max(0, y))
    return crop_w, crop_h, x, y


def append_reel_motion_graph(graph, plan):
    graph.append(
        "[vcat]fps=30,crop=w='min(iw,ih*9/16)':h=ih:"
        "x='(iw-min(iw,ih*9/16))*0.5':y=0,"
        "scale=1080:1920:flags=fast_bilinear,setsar=1[vbase]"
    )
    intervals = reel_motion_intervals(plan)
    if not intervals:
        return "vbase"
    if len(intervals) == 1:
        _start, _end, scale, fx, fy = intervals[0]
        if scale <= 1.001:
            return "vbase"
        crop_w, crop_h, x, y = motion_crop(scale, fx, fy)
        graph.append(f"[vbase]crop={crop_w}:{crop_h}:{x}:{y},scale=1080:1920:flags=fast_bilinear,setsar=1[vmotion]")
        return "vmotion"

    split_labels = "".join(f"[vm{i}]" for i in range(len(intervals)))
    graph.append(f"[vbase]split={len(intervals)}{split_labels}")
    segment_labels = []
    for index, (start, end, scale, fx, fy) in enumerate(intervals):
        chain = f"trim=start={start:.4f}:end={end:.4f},setpts=PTS-STARTPTS"
        if scale > 1.001:
            crop_w, crop_h, x, y = motion_crop(scale, fx, fy)
            chain += f",crop={crop_w}:{crop_h}:{x}:{y},scale=1080:1920:flags=fast_bilinear"
        chain += ",setsar=1"
        label = f"vms{index}"
        graph.append(f"[vm{index}]{chain}[{label}]")
        segment_labels.append(f"[{label}]")
    graph.append("".join(segment_labels) + f"concat=n={len(segment_labels)}:v=1:a=0[vmotion]")
    return "vmotion"


def video_normalize_chain(mode):
    if mode == "reels":
        return "fps=30,crop=w='min(iw,ih*9/16)':h=ih:x='(iw-min(iw,ih*9/16))*0.5':y=0,scale=1080:1920:flags=fast_bilinear,setsar=1"
    return "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,setsar=1"


def apply_music(graph, plan, selected_music, music_index, audio_input):
    audio_output = audio_input
    if selected_music and selected_music.get("localPath") and music_index is not None:
        gain_db = float(selected_music.get("gainDb", -28))
        duration = max(.5, float(plan.get("outputDuration") or 0))
        fade_out = max(.1, duration - 1.2)
        graph.append(
            f"[{music_index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
            f"volume={gain_db}dB,afade=t=in:st=0:d=1.0,afade=t=out:st={fade_out:.3f}:d=1.2,atrim=0:{duration:.3f}[musicbed]"
        )
        if bool(selected_music.get("duckUnderVoice", True)):
            graph.append(f"[{audio_input}]asplit=2[voice_sidechain][voice_mix]")
            graph.append("[musicbed][voice_sidechain]sidechaincompress=threshold=0.035:ratio=8:attack=15:release=350:makeup=1[ducked]")
            graph.append("[voice_mix][ducked]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.94[aout]")
        else:
            graph.append(f"[{audio_input}][musicbed]amix=inputs=2:duration=first:dropout_transition=0,alimiter=limit=0.94[aout]")
        audio_output = "aout"
    return audio_output


def build_ffmpeg_multicam(manifest, source, ass_file, output_file):
    plan = manifest["renderPlan"]
    mode = plan["mode"]
    multicam = manifest.get("multicam") or {}
    camera_ranges = multicam.get("cameraRanges") or []
    if not camera_ranges:
        raise RuntimeError("multicam render has no camera ranges")

    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y", "-i", source]
    next_index = 1
    camera_b = multicam.get("cameraB") or None
    camera_b_index = None
    if camera_b and camera_b.get("localPath"):
        camera_b_index = next_index
        command += ["-i", camera_b["localPath"]]
        next_index += 1
    external = multicam.get("externalAudio") or None
    external_index = None
    if external and external.get("localPath"):
        external_index = next_index
        command += ["-i", external["localPath"]]
        next_index += 1
    selected_music = (manifest.get("musicTracks") or [None])[0]
    music_index = None
    if selected_music and selected_music.get("localPath"):
        music_index = next_index
        command += ["-stream_loop", "-1", "-i", selected_music["localPath"]]
        next_index += 1

    source_range_start = float(multicam.get("sourceRangeStart") or 0)
    graph = []
    video_labels = []
    normalize = video_normalize_chain(mode)
    for index, segment in enumerate(camera_ranges):
        local_start = float(segment["start"])
        local_end = float(segment["end"])
        if local_end <= local_start:
            continue
        global_start = source_range_start + local_start
        global_end = source_range_start + local_end
        camera = segment.get("camera") or "A"
        if camera == "B":
            if camera_b_index is None or not camera_b:
                raise RuntimeError("Camera Plan selects B but Camera B media is unavailable")
            offset = float(camera_b.get("offsetSeconds") or 0)
            trim_start = global_start - offset
            trim_end = global_end - offset
            input_index = camera_b_index
            if trim_start < -0.02:
                raise RuntimeError("Camera B segment falls before synchronized media coverage")
        else:
            trim_start = global_start
            trim_end = global_end
            input_index = 0
        label = f"mcvideo{index}"
        graph.append(f"[{input_index}:v]trim=start={max(0, trim_start):.4f}:end={max(0, trim_end):.4f},setpts=PTS-STARTPTS,{normalize}[{label}]")
        video_labels.append(f"[{label}]")
    if not video_labels:
        raise RuntimeError("multicam render has no usable video segments")
    graph.append("".join(video_labels) + f"concat=n={len(video_labels)}:v=1:a=0[vcat]")

    keep = plan.get("keepSegments") or []
    audio_plan = multicam.get("audioPlan") or {"source": "camera_a"}
    use_external = audio_plan.get("source") == "external_audio"
    if use_external and (external_index is None or not external):
        raise RuntimeError("External Audio is selected but its synchronized media is unavailable")
    audio_labels = []
    for index, segment in enumerate(keep):
        local_start = float(segment["start"])
        local_end = float(segment["end"])
        if local_end <= local_start:
            continue
        global_start = source_range_start + local_start
        global_end = source_range_start + local_end
        if use_external:
            offset = float(external.get("offsetSeconds") or 0)
            trim_start = global_start - offset
            trim_end = global_end - offset
            input_index = external_index
            if trim_start < -0.02:
                raise RuntimeError("External Audio segment falls before synchronized media coverage")
        else:
            trim_start = global_start
            trim_end = global_end
            input_index = 0
        label = f"mcaudio{index}"
        graph.append(f"[{input_index}:a]atrim=start={max(0, trim_start):.4f}:end={max(0, trim_end):.4f},asetpts=PTS-STARTPTS[{label}]")
        audio_labels.append(f"[{label}]")
    if not audio_labels:
        raise RuntimeError("multicam render has no usable audio segments")
    graph.append("".join(audio_labels) + f"concat=n={len(audio_labels)}:v=0:a=1[acat]")

    if mode == "reels":
        video_input = append_reel_motion_graph(graph, plan)
        graph.append(f"[{video_input}]{color_filter_v2(plan)},ass='{ass_file}'[vout]")
    else:
        graph.append(f"[vcat]{color_filter_v2(plan)},ass='{ass_file}'[vout]")
    graph.append(f"[acat]{audio_filter_v2(plan)}[voice]")
    audio_output = apply_music(graph, plan, selected_music, music_index, "voice")

    video_preset = "veryfast" if mode == "reels" else "medium"
    video_crf = "20" if mode == "reels" else "18"
    command += [
        "-filter_complex", ";".join(graph),
        "-map", "[vout]", "-map", f"[{audio_output}]",
        "-c:v", "libx264", "-preset", video_preset, "-crf", video_crf,
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-r", "30", output_file
    ]
    return command


def build_ffmpeg_v2(manifest, source, ass_file, output_file):
    if manifest.get("version") == 2 and manifest.get("multicam"):
        return build_ffmpeg_multicam(manifest, source, ass_file, output_file)

    plan = manifest["renderPlan"]
    mode = plan["mode"]
    keep = plan.get("keepSegments") or []
    if not keep:
        raise RuntimeError("render plan has no keep segments")
    source_range = (manifest.get("source") or {}).get("range")
    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y"]
    if source_range:
        start = float(source_range["start"])
        length = float(source_range["end"]) - start
        command += ["-ss", f"{start:.4f}", "-t", f"{length:.4f}"]
    command += ["-i", source]

    music_tracks = manifest.get("musicTracks") or []
    selected_music = music_tracks[0] if music_tracks else None
    music_index = None
    if selected_music and selected_music.get("localPath"):
        music_index = 1
        command += ["-stream_loop", "-1", "-i", selected_music["localPath"]]

    graph = []
    concat_inputs = []
    for index, segment in enumerate(keep):
        start = float(segment["start"])
        end = float(segment["end"])
        if end <= start:
            continue
        graph.append(f"[0:v]trim=start={start:.4f}:end={end:.4f},setpts=PTS-STARTPTS[v{index}]")
        graph.append(f"[0:a]atrim=start={start:.4f}:end={end:.4f},asetpts=PTS-STARTPTS[a{index}]")
        concat_inputs.append(f"[v{index}][a{index}]")
    if not concat_inputs:
        raise RuntimeError("no valid keep segments remained")
    graph.append("".join(concat_inputs) + f"concat=n={len(concat_inputs)}:v=1:a=1[vcat][acat]")

    if mode == "reels":
        video_input = append_reel_motion_graph(graph, plan)
        graph.append(f"[{video_input}]{color_filter_v2(plan)},ass='{ass_file}'[vout]")
    else:
        video_chain = "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
        graph.append(f"[vcat]{video_chain},{color_filter_v2(plan)},ass='{ass_file}'[vout]")

    graph.append(f"[acat]{audio_filter_v2(plan)}[voice]")
    audio_output = apply_music(graph, plan, selected_music, music_index, "voice")

    video_preset = "veryfast" if mode == "reels" else "medium"
    video_crf = "20" if mode == "reels" else "18"
    command += [
        "-filter_complex", ";".join(graph),
        "-map", "[vout]", "-map", f"[{audio_output}]",
        "-c:v", "libx264", "-preset", video_preset, "-crf", video_crf,
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-r", "30", output_file
    ]
    return command


bw.base.build_ffmpeg = build_ffmpeg_v2
bw.build_ffmpeg = build_ffmpeg_v2


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_finishing_worker.py payload.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "source_url", "manifest_url", "output_upload_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    bw.base.callback(payload, "rendering", 2, "Downloading render manifest")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-finish-") as directory:
        manifest_path = os.path.join(directory, "manifest.json")
        source_path = os.path.join(directory, "source-video")
        ass_path = os.path.join(directory, "graphics.ass")
        main_path = os.path.join(directory, "main.mp4")

        bw.base.download(payload["manifest_url"], manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        validate_manifest_v2(manifest)

        bw.base.callback(payload, "rendering", 6, "Downloading source video")
        bw.base.download(payload["source_url"], source_path)

        multicam = manifest.get("multicam") or {}
        camera_b = multicam.get("cameraB") or None
        if camera_b and camera_b.get("url"):
            local_path = os.path.join(directory, "camera-b")
            bw.base.download(camera_b["url"], local_path)
            camera_b["localPath"] = local_path
        external = multicam.get("externalAudio") or None
        if external and external.get("url"):
            local_path = os.path.join(directory, "external-audio")
            bw.base.download(external["url"], local_path)
            external["localPath"] = local_path

        tracks = manifest.get("musicTracks") or []
        for index, track in enumerate(tracks):
            url = track.get("url")
            if not url:
                continue
            local_path = os.path.join(directory, f"music-{index}")
            bw.base.download(url, local_path)
            track["localPath"] = local_path

        bw.base.callback(payload, "rendering", 12, "Building Graphics V2 and mastering chain")
        build_broadcast_ass_v2(manifest, ass_path)

        bw.safe_progress_callback(payload, 18, "Encoding mastered video · estimating")
        bw.run_main_render_with_progress(payload, manifest, source_path, ass_path, main_path)
        if not os.path.exists(main_path) or os.path.getsize(main_path) < 1024:
            raise RuntimeError("FFmpeg completed without a usable main render")

        bw.base.callback(payload, "rendering", 89, "Building timestamp-safe package")
        bw.package_with_bumpers(manifest, main_path, sys.argv[2], directory)
        if not os.path.exists(sys.argv[2]) or os.path.getsize(sys.argv[2]) < 1024:
            raise RuntimeError("Video Producer package did not create a usable output file")

        bw.base.callback(payload, "rendering", 94, "Uploading finished master")
        bw.base.upload_file(payload["output_upload_url"], sys.argv[2])
        bw.base.callback(payload, "completed", 100, "Ready to review")


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
                bw.base.callback(payload, "failed", 100, "Render failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr, flush=True)
        raise
