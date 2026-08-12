#!/usr/bin/env python3
"""Refined Apostolic Guide Pathway renderer.

Keeps the existing master template while replacing visible rectangular glow
layers with full-frame radial light and giving the audio visualizer a cleaner,
sharper edge.
"""
from __future__ import annotations

from pathlib import Path
import tempfile
import urllib.request

from render_pathway_video import FORMATS, brand_window, cue_list, ffprobe_duration, make_ass, run


def render(payload: dict, output: Path) -> None:
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
        urllib.request.urlretrieve(str(payload["audio_url"]), audio)
        duration = ffprobe_duration(audio)
        timeline_ass = temp / "timeline.ass"
        make_ass(timeline_ass, payload, duration, spec)

        width, height = spec["width"], spec["height"]
        brand_start, brand_end = brand_window(cue_list(payload), duration)
        show_brand = brand_end > brand_start
        small_enable = "1"
        hero_enable = "0"
        if show_brand:
            small_enable = f"not(between(t,{brand_start},{brand_end}))"
            hero_enable = f"between(t,{brand_start},{brand_end})"
        progress_y = height - 4

        # These light fields are full-frame alpha gradients, so there are no
        # rectangular layer boundaries even on very dark displays.
        red_alpha = (
            "255*0.22*exp(-((pow(X-W*0.03,2)/pow(W*0.52,2))"
            "+(pow(Y-H*0.94,2)/pow(H*0.60,2))))"
        )
        blue_alpha = (
            "255*0.18*exp(-((pow(X-W*0.92,2)/pow(W*0.48,2))"
            "+(pow(Y-H*0.05,2)/pow(H*0.55,2))))"
        )

        filter_graph = (
            f"[0:a]asplit=2[aout][av];"
            f"[av]showfreqs=s={spec['spectrum_w']}x{spec['spectrum_h']}:mode=bar:ascale=log:fscale=log:"
            f"win_size=2048:overlap=0.82:colors=0xE7EBEF@0.80,format=rgba,colorkey=black:0.16:0.025[specviz];"
            f"color=c=0x080B0F:s={width}x{height}:d={duration}[base];"
            f"color=c=0x7E1E2B:s={width}x{height}:d={duration},format=rgba,"
            f"geq=r='126':g='30':b='43':a='{red_alpha}'[red];"
            f"color=c=0x365F8F:s={width}x{height}:d={duration},format=rgba,"
            f"geq=r='54':g='95':b='143':a='{blue_alpha}'[blue];"
            f"[base][red]overlay=0:0[b1];"
            f"[b1][blue]overlay=0:0[b2];"
            f"[1:v]split=2[ls][lh];[ls]scale={spec['logo_small']}:-1[small];[lh]scale={spec['logo_hero']}:-1[hero];"
            f"[b2][small]overlay={spec['margin']}:{spec['logo_y']}:enable='{small_enable}'[b3];"
            f"[b3][hero]overlay=(W-w)/2:{spec['hero_y']}:enable='{hero_enable}'[b4];"
            f"[b4][specviz]overlay=(W-w)/2:{spec['spectrum_y']}[b5];"
            f"[b5]ass='{timeline_ass}'[b6];"
            f"[b6]drawbox=x=0:y={progress_y}:w={width}:h=4:color=0x537BA4@0.42:t=fill,"
            f"drawbox=x=0:y={progress_y}:w='{width}*t/{duration}':h=4:color=0x8B2431@0.96:t=fill,"
            f"noise=alls=1.5:allf=t[v]"
        )

        run([
            "ffmpeg", "-y", "-i", str(audio), "-loop", "1", "-i", str(wordmark),
            "-filter_complex", filter_graph,
            "-map", "[v]", "-map", "[aout]", "-t", str(duration),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output),
        ])
