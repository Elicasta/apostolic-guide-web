#!/usr/bin/env python3
"""Optimized Apostolic Guide Pathway renderer.

The expensive ambient light field is rendered once as a static background instead
of recalculating radial gradients and grain for every frame. The final encode only
animates the audio spectrum, timeline copy, logo states, and progress treatment.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
import subprocess
import tempfile
import urllib.request

from render_pathway_video import FORMATS, brand_window, cue_list, ffprobe_duration, make_ass, run

ProgressCallback = Callable[[int, str], None]


def _report(callback: ProgressCallback | None, percent: int, stage: str) -> None:
    if callback:
        callback(max(0, min(100, int(percent))), stage)


def _build_background(path: Path, spec: dict) -> None:
    """Build the dark red/blue ambient background once, not once per video frame."""
    width, height = spec["width"], spec["height"]
    field_w = max(480, width // 2)
    field_h = max(480, height // 2)
    red_alpha = (
        "255*0.22*exp(-((pow(X-W*0.03,2)/pow(W*0.52,2))"
        "+(pow(Y-H*0.94,2)/pow(H*0.60,2))))"
    )
    blue_alpha = (
        "255*0.18*exp(-((pow(X-W*0.92,2)/pow(W*0.48,2))"
        "+(pow(Y-H*0.05,2)/pow(H*0.55,2))))"
    )
    graph = (
        f"color=c=0x080B0F:s={width}x{height}:d=1[base];"
        f"color=c=0x7E1E2B:s={field_w}x{field_h}:d=1,format=rgba,"
        f"geq=r='126':g='30':b='43':a='{red_alpha}',scale={width}:{height}:flags=bicubic[red];"
        f"color=c=0x365F8F:s={field_w}x{field_h}:d=1,format=rgba,"
        f"geq=r='54':g='95':b='143':a='{blue_alpha}',scale={width}:{height}:flags=bicubic[blue];"
        f"[base][red]overlay=0:0[b1];"
        f"[b1][blue]overlay=0:0,noise=alls=1.2[bg]"
    )
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-filter_complex", graph,
        "-map", "[bg]", "-frames:v", "1", str(path),
    ])


def _run_with_progress(command: list[str], duration: float, callback: ProgressCallback | None) -> None:
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    last_percent = 7
    if process.stdout:
        for raw in process.stdout:
            line = raw.strip()
            if not line.startswith(("out_time_us=", "out_time_ms=")):
                continue
            try:
                micros = int(line.split("=", 1)[1])
            except ValueError:
                continue
            seconds = micros / 1_000_000
            ratio = 0 if duration <= 0 else max(0.0, min(1.0, seconds / duration))
            percent = 8 + int(ratio * 84)
            if percent >= last_percent + 2:
                last_percent = percent
                _report(callback, percent, "Rendering video")
    return_code = process.wait()
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)
    _report(callback, 93, "Render complete")


def render(payload: dict, output: Path, progress_callback: ProgressCallback | None = None) -> None:
    video_format = str(payload.get("format", "youtube"))
    if video_format not in FORMATS:
        raise RuntimeError(f"Unsupported video format: {video_format}")
    spec = FORMATS[video_format]
    wordmark = Path("public/brand/apostolic-guide-wordmark-reversed.png")
    if not wordmark.exists():
        raise RuntimeError(f"Brand wordmark is missing: {wordmark}")

    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)
        audio = temp / "source-audio"
        background = temp / "background.png"
        _report(progress_callback, 2, "Loading audio")
        urllib.request.urlretrieve(str(payload["audio_url"]), audio)
        duration = ffprobe_duration(audio)
        timeline_ass = temp / "timeline.ass"
        make_ass(timeline_ass, payload, duration, spec)

        _report(progress_callback, 4, "Building background")
        _build_background(background, spec)

        width, height = spec["width"], spec["height"]
        brand_start, brand_end = brand_window(cue_list(payload), duration)
        show_brand = brand_end > brand_start
        small_enable = "1"
        hero_enable = "0"
        if show_brand:
            small_enable = f"not(between(t,{brand_start},{brand_end}))"
            hero_enable = f"between(t,{brand_start},{brand_end})"
        progress_y = height - 4

        filter_graph = (
            f"[0:a]asplit=2[aout][av];"
            f"[av]showfreqs=s={spec['spectrum_w']}x{spec['spectrum_h']}:mode=bar:ascale=log:fscale=log:"
            f"win_size=2048:overlap=0.82:colors=0xE7EBEF@0.80,format=rgba,colorkey=black:0.16:0.025[specviz];"
            f"[1:v]format=rgba[base];"
            f"[2:v]split=2[ls][lh];[ls]scale={spec['logo_small']}:-1[small];[lh]scale={spec['logo_hero']}:-1[hero];"
            f"[base][small]overlay={spec['margin']}:{spec['logo_y']}:enable='{small_enable}'[b3];"
            f"[b3][hero]overlay=(W-w)/2:{spec['hero_y']}:enable='{hero_enable}'[b4];"
            f"[b4][specviz]overlay=(W-w)/2:{spec['spectrum_y']}[b5];"
            f"[b5]ass='{timeline_ass}'[b6];"
            f"[b6]drawbox=x=0:y={progress_y}:w={width}:h=4:color=0x537BA4@0.42:t=fill,"
            f"drawbox=x=0:y={progress_y}:w='{width}*t/{duration}':h=4:color=0x8B2431@0.96:t=fill,"
            f"fps=30[v]"
        )

        _report(progress_callback, 7, "Starting encoder")
        command = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(audio),
            "-loop", "1", "-framerate", "30", "-i", str(background),
            "-loop", "1", "-framerate", "30", "-i", str(wordmark),
            "-filter_complex", filter_graph,
            "-map", "[v]", "-map", "[aout]", "-t", str(duration),
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p",
            "-threads", "0", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
            "-progress", "pipe:1", "-nostats", str(output),
        ]
        _run_with_progress(command, duration, progress_callback)
