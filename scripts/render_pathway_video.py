#!/usr/bin/env python3
"""Render an Apostolic Guide Pathway video and publish it to Supabase Storage.

The CI renderer mirrors the Video Studio master template instead of using a flat
fallback. It keeps the exact brand wordmark, audio-reactive visualizer, red/blue
ambient depth, bottom-left chapter tracker, and red/blue progress treatment.
"""
from __future__ import annotations

from pathlib import Path
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

FORMATS = {
    "youtube": {
        "width": 1920,
        "height": 1080,
        "margin": 100,
        "logo_small": 320,
        "logo_hero": 1033,
        "logo_y": 78,
        "hero_y": 355,
        "eyebrow_size": 28,
        "title_size": 84,
        "body_size": 31,
        "title_y": 500,
        "body_y": 652,
        "brand_title_y": 690,
        "brand_body_y": 770,
        "spectrum_w": 760,
        "spectrum_h": 92,
        "spectrum_y": 790,
        "tracker_y": 945,
        "tracker_title_y": 980,
        "time_y": 980,
        "safe_bottom": 0,
    },
    "vertical": {
        "width": 1080,
        "height": 1920,
        "margin": 72,
        "logo_small": 300,
        "logo_hero": 680,
        "logo_y": 86,
        "hero_y": 560,
        "eyebrow_size": 28,
        "title_size": 88,
        "body_size": 34,
        "title_y": 820,
        "body_y": 1045,
        "brand_title_y": 1015,
        "brand_body_y": 1140,
        "spectrum_w": 700,
        "spectrum_h": 118,
        "spectrum_y": 1325,
        "tracker_y": 1560,
        "tracker_title_y": 1605,
        "time_y": 1605,
        "safe_bottom": 260,
    },
    "square": {
        "width": 1080,
        "height": 1080,
        "margin": 72,
        "logo_small": 300,
        "logo_hero": 670,
        "logo_y": 62,
        "hero_y": 330,
        "eyebrow_size": 24,
        "title_size": 72,
        "body_size": 30,
        "title_y": 505,
        "body_y": 640,
        "brand_title_y": 680,
        "brand_body_y": 755,
        "spectrum_w": 680,
        "spectrum_h": 82,
        "spectrum_y": 805,
        "tracker_y": 940,
        "tracker_title_y": 972,
        "time_y": 972,
        "safe_bottom": 0,
    },
}


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def ffprobe_duration(path: Path) -> float:
    output = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], text=True).strip()
    return float(output)


def ass_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    seconds -= hours * 3600
    minutes = int(seconds // 60)
    seconds -= minutes * 60
    return f"{hours}:{minutes:02d}:{seconds:05.2f}"


def clock_time(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"{total // 60}:{total % 60:02d}"


def ass_escape(value: object) -> str:
    return str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def cue_list(payload: dict) -> list[dict]:
    raw = payload.get("timeline")
    return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []


def brand_window(cues: list[dict], duration: float) -> tuple[float, float]:
    for index, cue in enumerate(cues):
        if str(cue.get("kind", "")) != "brand":
            continue
        start = max(0.0, float(cue.get("start", 0) or 0))
        end = duration
        if index + 1 < len(cues):
            end = min(duration, max(start + .1, float(cues[index + 1].get("start", duration) or duration)))
        return start, end
    return 0.0, 0.0


def build_chapters(payload: dict, duration: float) -> list[dict]:
    title = str(payload.get("title", "Pathway")).upper()
    chapters: list[dict] = [{"start": 0.0, "label": "INTRO", "reference": title}]
    for cue in cue_list(payload):
        if str(cue.get("kind", "")) != "scripture":
            continue
        chapters.append({
            "start": max(0.0, float(cue.get("start", 0) or 0)),
            "label": str(cue.get("title") or cue.get("reference") or "SCRIPTURE").upper(),
            "reference": str(cue.get("reference") or cue.get("eyebrow") or "").upper(),
        })
    cta = next((cue for cue in cue_list(payload) if str(cue.get("kind", "")) == "cta"), None)
    if cta:
        chapters.append({
            "start": max(0.0, float(cta.get("start", duration) or duration)),
            "label": "COMPLETE",
            "reference": "APOSTOLIC GUIDE",
        })
    chapters.sort(key=lambda item: item["start"])
    return chapters


def make_ass(path: Path, payload: dict, duration: float, spec: dict) -> None:
    width, height, margin = spec["width"], spec["height"], spec["margin"]
    title_margin = int(width * (.09 if width <= 1080 else .11))
    body_margin = int(width * (.11 if height > width else .18))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Path,Noto Sans,{max(15, int(width * .0095))},&H009DA5AE,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,3,0,1,0,0,9,{margin},{margin},{margin},1
Style: Eyebrow,Noto Sans,{spec['eyebrow_size']},&H00BDC3C9,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,4,0,1,0,0,8,{margin},{margin},0,1
Style: Title,Noto Serif,{spec['title_size']},&H00F3EFE7,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,-1,0,1,0,0,5,{title_margin},{title_margin},0,1
Style: Body,Noto Serif,{spec['body_size']},&H00C3C8CD,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,{body_margin},{body_margin},0,1
Style: TrackerKicker,Noto Sans,{max(15, int(width * .010))},&H009AA3AC,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,7,{margin},{margin},0,1
Style: TrackerTitle,Noto Sans,{max(17, int(width * .0125))},&H00D1D6DB,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,7,{margin},{margin},0,1
Style: Time,Noto Sans,{max(15, int(width * .0095))},&H009AA3AC,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,9,{margin},{margin},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    title = ass_escape(str(payload.get("title", "Pathway")).upper())
    lines.append(f"Dialogue: 0,{ass_time(0)},{ass_time(duration)},Path,,0,0,0,,{{\\pos({width - margin},{margin + 6})}}{title} · PATHWAY\n")

    cues = cue_list(payload)
    for index, cue in enumerate(cues):
        start = max(0.0, float(cue.get("start", 0) or 0))
        next_start = float(cues[index + 1].get("start", duration)) if index + 1 < len(cues) else duration
        end = max(start + .1, min(duration, next_start))
        kind = str(cue.get("kind", "scripture"))
        is_brand = kind == "brand"
        title_y = spec["brand_title_y"] if is_brand else spec["title_y"]
        body_y = spec["brand_body_y"] if is_brand else spec["body_y"]
        eyebrow_y = title_y - (int(height * .07) if is_brand else int(height * (.15 if height > width else .17)))
        if not is_brand:
            lines.append(f"Dialogue: 2,{ass_time(start)},{ass_time(end)},Eyebrow,,0,0,0,,{{\\pos({width // 2},{eyebrow_y})\\fad(260,300)}}{ass_escape(cue.get('eyebrow', ''))}\n")
        lines.append(f"Dialogue: 3,{ass_time(start)},{ass_time(end)},Title,,0,0,0,,{{\\pos({width // 2},{title_y})\\fad(260,300)}}{ass_escape(cue.get('title', ''))}\n")
        if cue.get("body"):
            lines.append(f"Dialogue: 2,{ass_time(start)},{ass_time(end)},Body,,0,0,0,,{{\\pos({width // 2},{body_y})\\fad(260,300)}}{ass_escape(cue.get('body', ''))}\n")

    chapters = build_chapters(payload, duration)
    scripture_total = max(1, len([item for item in chapters if item["label"] not in {"INTRO", "COMPLETE"}]))
    scripture_index = 0
    for index, chapter in enumerate(chapters):
        start = chapter["start"]
        end = chapters[index + 1]["start"] if index + 1 < len(chapters) else duration
        if chapter["label"] not in {"INTRO", "COMPLETE"}:
            scripture_index += 1
            kicker = f"{scripture_index:02d} / {scripture_total:02d} · {chapter['reference']}"
        elif chapter["label"] == "INTRO":
            kicker = f"INTRO · {chapter['reference']}"
        else:
            kicker = "PATHWAY COMPLETE · APOSTOLIC GUIDE"
        lines.append(f"Dialogue: 4,{ass_time(start)},{ass_time(end)},TrackerKicker,,0,0,0,,{{\\pos({margin},{spec['tracker_y']})}}{ass_escape(kicker)}\n")
        lines.append(f"Dialogue: 4,{ass_time(start)},{ass_time(end)},TrackerTitle,,0,0,0,,{{\\pos({margin},{spec['tracker_title_y']})}}{ass_escape(chapter['label'])}\n")

    lines.append(f"Dialogue: 4,{ass_time(0)},{ass_time(duration)},Time,,0,0,0,,{{\\pos({width - margin},{spec['time_y']})}}{clock_time(duration)}\n")
    path.write_text("".join(lines))


def supabase_request(method: str, url: str, body: bytes | None = None, content_type: str = "application/json") -> bytes:
    service_key = os.environ.get("VIDEO_STUDIO_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not service_key:
        raise RuntimeError("VIDEO_STUDIO_SUPABASE_SERVICE_ROLE_KEY is missing from GitHub Actions secrets.")
    request = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {service_key}",
        "apikey": service_key,
        "Content-Type": content_type,
        "Prefer": "return=minimal",
    })
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def update_row(table: str, row_id: str, values: dict) -> None:
    base = os.environ.get("VIDEO_STUDIO_SUPABASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("VIDEO_STUDIO_SUPABASE_URL is missing from GitHub Actions secrets.")
    url = f"{base}/rest/v1/{table}?id=eq.{urllib.parse.quote(row_id)}"
    supabase_request("PATCH", url, json.dumps(values).encode())


def update_render(job_id: str, values: dict) -> None:
    update_row("pathway_video_renders", job_id, values)


def update_asset(asset_id: str, values: dict) -> None:
    if asset_id:
        update_row("pathway_assets", asset_id, values)


def upload_render(output: Path, slug: str, job_id: str, video_format: str) -> tuple[str, str]:
    base = os.environ.get("VIDEO_STUDIO_SUPABASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("VIDEO_STUDIO_SUPABASE_URL is missing from GitHub Actions secrets.")
    storage_path = f"pathways/{slug}/{job_id}-{video_format}.mp4"
    encoded_path = urllib.parse.quote(storage_path, safe="/")
    service_key = os.environ.get("VIDEO_STUDIO_SUPABASE_SERVICE_ROLE_KEY", "").strip()
    request = urllib.request.Request(
        f"{base}/storage/v1/object/pathway-video/{encoded_path}",
        data=output.read_bytes(),
        method="POST",
        headers={
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        },
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        response.read()
    return storage_path, f"{base}/storage/v1/object/public/pathway-video/{encoded_path}"


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

        # Red lower-left and blue upper-right glows are separate blurred layers.
        red_w, red_h = int(width * .62), int(height * .62)
        blue_w, blue_h = int(width * .58), int(height * .58)
        red_x, red_y = -int(red_w * .42), height - int(red_h * .58)
        blue_x, blue_y = width - int(blue_w * .60), -int(blue_h * .43)
        progress_y = height - 4

        filter_graph = (
            f"[0:a]asplit=2[aout][av];"
            f"[av]showfreqs=s={spec['spectrum_w']}x{spec['spectrum_h']}:mode=bar:ascale=log:fscale=log:win_size=1024:overlap=0.75:colors=0xD9DFE4@0.42,format=rgba,colorkey=black:0.12:0.08[specviz];"
            f"color=c=0x080B0F:s={width}x{height}:d={duration}[base];"
            f"color=c=0x7E1E2B@0.28:s={red_w}x{red_h}:d={duration},format=rgba,gblur=sigma=120[red];"
            f"color=c=0x365F8F@0.25:s={blue_w}x{blue_h}:d={duration},format=rgba,gblur=sigma=120[blue];"
            f"[base][red]overlay={red_x}:{red_y}[b1];"
            f"[b1][blue]overlay={blue_x}:{blue_y}[b2];"
            f"[1:v]split=2[ls][lh];[ls]scale={spec['logo_small']}:-1[small];[lh]scale={spec['logo_hero']}:-1[hero];"
            f"[b2][small]overlay={spec['margin']}:{spec['logo_y']}:enable='{small_enable}'[b3];"
            f"[b3][hero]overlay=(W-w)/2:{spec['hero_y']}:enable='{hero_enable}'[b4];"
            f"[b4][specviz]overlay=(W-w)/2:{spec['spectrum_y']}[b5];"
            f"[b5]ass='{timeline_ass}'[b6];"
            f"[b6]drawbox=x=0:y={progress_y}:w={width}:h=4:color=0x537BA4@0.42:t=fill,"
            f"drawbox=x=0:y={progress_y}:w='{width}*t/{duration}':h=4:color=0x8B2431@0.96:t=fill,"
            f"noise=alls=2:allf=t[v]"
        )

        run([
            "ffmpeg", "-y", "-i", str(audio), "-loop", "1", "-i", str(wordmark),
            "-filter_complex", filter_graph,
            "-map", "[v]", "-map", "[aout]", "-t", str(duration),
            "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output),
        ])


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_pathway_video.py payload.json output.mp4")
    payload = json.loads(Path(sys.argv[1]).read_text())
    output = Path(sys.argv[2])
    job_id = str(payload.get("job_id", "")).strip()
    asset_id = str(payload.get("asset_id", "")).strip()
    slug = str(payload.get("slug", "")).strip()
    video_format = str(payload.get("format", "youtube")).strip()
    if not job_id or not slug:
        raise SystemExit("Render payload is missing job_id or slug.")

    try:
        update_render(job_id, {"status": "rendering", "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "error": None})
        render(payload, output)
        storage_path, public_url = upload_render(output, slug, job_id, video_format)
        completed_at = dt.datetime.now(dt.timezone.utc).isoformat()
        update_render(job_id, {
            "status": "completed",
            "storage_path": storage_path,
            "output_url": public_url,
            "completed_at": completed_at,
            "error": None,
        })
        update_asset(asset_id, {
            "status": "ready_to_publish",
            "file_url": public_url,
            "updated_at": completed_at,
        })
        print(public_url)
    except Exception as error:
        failed_at = dt.datetime.now(dt.timezone.utc).isoformat()
        try:
            update_render(job_id, {"status": "failed", "error": str(error)[:1800], "completed_at": failed_at})
            update_asset(asset_id, {"status": "blocked", "notes": f"Video Studio render failed: {str(error)[:1500]}", "updated_at": failed_at})
        except Exception as status_error:
            print(f"Could not update failed render status: {status_error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
