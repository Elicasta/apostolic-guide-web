#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import json
import math
import re
import subprocess
import sys
import tempfile
import urllib.request


def callback(payload: dict, status: str, error: str | None = None) -> None:
    body = {
        "clip_id": payload["clip_id"],
        "token": payload["callback_token"],
        "status": status,
    }
    if error:
        body["error"] = error[:2000]
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def ass_time(seconds: float) -> str:
    value = max(0.0, float(seconds))
    hours = int(value // 3600)
    minutes = int((value % 3600) // 60)
    secs = value % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def ass_escape(value: str) -> str:
    return str(value or "").replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def wrap_cover(value: str, max_chars: int = 15, max_lines: int = 3) -> str:
    words = clean_text(value).upper().split()
    if not words:
        return "APOSTOLIC GUIDE"
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars and len(lines) < max_lines - 1:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return r"\N".join(ass_escape(line) for line in lines[:max_lines])


def create_caption_ass(payload: dict, path: Path, duration: float) -> None:
    creative = payload.get("creative") if isinstance(payload.get("creative"), dict) else {}
    cues = creative.get("caption_cues") if isinstance(creative.get("caption_cues"), list) else []
    title = clean_text(creative.get("title", ""))[:64]
    pathway = clean_text(creative.get("pathway", "Apostolic Guide"))[:64]
    header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,DejaVu Sans,62,&H00FFFFFF,&H00FFFFFF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,3,2,0,2,56,56,320,1
Style: Hook,DejaVu Sans,31,&H00FFFFFF,&H00FFFFFF,&H00000000,&H8A07121B,-1,0,0,0,100,100,2,0,3,1,0,8,70,70,185,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
"""
    events: list[str] = []
    if title:
        top = f"APOSTOLIC GUIDE  ·  {title.upper()}"
        events.append(f"Dialogue: 0,0:00:00.00,{ass_time(min(duration, 2.8))},Hook,,0,0,0,,{{\\fad(120,180)\\fscx96\\fscy96\\t(0,160,\\fscx100\\fscy100)}}{ass_escape(top)}")
    elif pathway:
        events.append(f"Dialogue: 0,0:00:00.00,{ass_time(min(duration, 2.8))},Hook,,0,0,0,,{{\\fad(120,180)}}APOSTOLIC GUIDE  ·  {ass_escape(pathway.upper())}")

    for index, cue in enumerate(cues[:60]):
        if not isinstance(cue, dict):
            continue
        try:
            start = max(0.0, float(cue.get("start", 0)))
            end = min(duration, float(cue.get("end", start + 0.6)))
        except (TypeError, ValueError):
            continue
        text = clean_text(cue.get("text", ""))
        if not text or end <= start:
            continue
        words = text.split()
        accent = "&H003121A9&" if index % 2 == 0 else "&H008F5D1F&"
        if words:
            first = ass_escape(words[0])
            rest = ass_escape(" ".join(words[1:]))
            styled = f"{{\\c{accent}}}{first}{{\\c&H00FFFFFF&}}"
            if rest:
                styled += f" {rest}"
        else:
            styled = ass_escape(text)
        animation = r"{\fad(60,80)\fscx96\fscy96\t(0,110,\fscx100\fscy100)}"
        events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{animation}{styled}")

    path.write_text(header + "\n".join(events) + "\n", encoding="utf-8")


def create_cover_ass(payload: dict, path: Path) -> None:
    creative = payload.get("creative") if isinstance(payload.get("creative"), dict) else {}
    headline = wrap_cover(creative.get("cover_headline") or creative.get("title") or "Apostolic Guide")
    subline = ass_escape(clean_text(creative.get("cover_subline") or creative.get("pathway") or "Pathway")[:80].upper())
    pathway = ass_escape(clean_text(creative.get("pathway") or "Apostolic Guide")[:64].upper())
    content = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Brand,DejaVu Sans,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,4,0,1,0,0,7,76,76,95,1
Style: Headline,DejaVu Serif,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,0,5,86,86,0,1
Style: Subline,DejaVu Sans,32,&H00E8E8E8,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,2,86,86,360,1
Style: Pathway,DejaVu Sans,22,&H00C9CDD1,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,4,0,1,0,0,2,86,86,118,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
Dialogue: 0,0:00:00.00,0:00:10.00,Brand,,0,0,0,,APOSTOLIC GUIDE
Dialogue: 0,0:00:00.00,0:00:10.00,Headline,,0,0,0,,{headline}
Dialogue: 0,0:00:00.00,0:00:10.00,Subline,,0,0,0,,{subline}
Dialogue: 0,0:00:00.00,0:00:10.00,Pathway,,0,0,0,,{pathway} · PATHWAY
"""
    path.write_text(content, encoding="utf-8")


def render(payload: dict, output: Path, cover: Path) -> None:
    start = max(0.0, float(payload["start_seconds"]))
    end = float(payload["end_seconds"])
    duration = end - start
    if duration < 1.0:
        raise RuntimeError("Social clip duration is invalid.")

    with tempfile.TemporaryDirectory() as directory:
        working = Path(directory)
        source = working / "source.mp4"
        captions = working / "captions.ass"
        cover_ass = working / "cover.ass"
        urllib.request.urlretrieve(str(payload["source_url"]), source)
        create_caption_ass(payload, captions, duration)
        create_cover_ass(payload, cover_ass)

        motion = (
            "scale=1140:2027:force_original_aspect_ratio=increase,"
            "crop=1080:1920:x='(iw-ow)/2+10*sin(t*0.48)':y='(ih-oh)/2+8*sin(t*0.31)',"
            "eq=contrast=1.025:saturation=1.035"
        )
        video_filter = f"{motion},subtitles={captions}:fontsdir=/usr/share/fonts/truetype/dejavu"
        fade_out_start = max(0.0, duration - 0.14)
        audio_filter = f"afade=t=in:st=0:d=0.08,afade=t=out:st={fade_out_start:.3f}:d=0.14"
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{start:.3f}", "-i", str(source),
            "-t", f"{duration:.3f}",
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", video_filter,
            "-af", audio_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            str(output),
        ], check=True)

        cover_at = start + min(1.6, max(0.35, duration * 0.16))
        cover_filter = (
            "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
            "gblur=sigma=6,eq=brightness=-0.18:saturation=0.72,"
            "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.26:t=fill,"
            f"subtitles={cover_ass}:fontsdir=/usr/share/fonts/truetype/dejavu"
        )
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-ss", f"{cover_at:.3f}", "-i", str(source),
            "-frames:v", "1", "-vf", cover_filter,
            "-q:v", "2", str(cover),
        ], check=True)


def upload(url: str, output: Path, content_type: str) -> None:
    request = urllib.request.Request(
        url,
        data=output.read_bytes(),
        method="PUT",
        headers={"Content-Type": content_type, "x-upsert": "true"},
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        response.read()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render_pathway_social_clip_worker.py PAYLOAD_JSON OUTPUT_MP4", file=sys.stderr)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text())
    output = Path(sys.argv[2])
    cover = output.with_name(output.stem + "-cover.jpg")
    try:
        callback(payload, "rendering")
        render(payload, output, cover)
        upload(payload["upload_url"], output, "video/mp4")
        upload(payload["cover_upload_url"], cover, "image/jpeg")
        callback(payload, "completed")
        return 0
    except Exception as exc:
        try:
            callback(payload, "failed", str(exc))
        except Exception as callback_error:
            print(f"callback failed: {callback_error}", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
