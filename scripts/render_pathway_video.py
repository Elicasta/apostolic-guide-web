#!/usr/bin/env python3
"""Render an Apostolic Guide Pathway video and publish it to Supabase Storage.

Input payload is the GitHub repository_dispatch client_payload written to JSON.
The renderer intentionally uses ffmpeg + system fonts so it stays deterministic on CI.
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
    "youtube": {"width": 1920, "height": 1080, "logo_small": 320, "logo_hero": 1033, "title_size": 82, "body_size": 31, "eyebrow_size": 26, "title_y": 505, "body_y": 645, "brand_title_y": 680, "brand_body_y": 760, "spectrum_w": 760, "spectrum_h": 90, "spectrum_y": 805, "margin": 100},
    "vertical": {"width": 1080, "height": 1920, "logo_small": 360, "logo_hero": 778, "title_size": 92, "body_size": 38, "eyebrow_size": 26, "title_y": 930, "body_y": 1110, "brand_title_y": 1210, "brand_body_y": 1330, "spectrum_w": 760, "spectrum_h": 120, "spectrum_y": 1540, "margin": 72},
    "square": {"width": 1080, "height": 1080, "logo_small": 300, "logo_hero": 670, "title_size": 72, "body_size": 30, "eyebrow_size": 24, "title_y": 500, "body_y": 635, "brand_title_y": 670, "brand_body_y": 750, "spectrum_w": 680, "spectrum_h": 82, "spectrum_y": 820, "margin": 72},
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


def ass_escape(value: object) -> str:
    return str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def make_ass(path: Path, payload: dict, duration: float, spec: dict) -> None:
    width, height, margin = spec["width"], spec["height"], spec["margin"]
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Path,DejaVu Sans,{max(15, int(width * .0095))},&H009AA3AC,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,9,{margin},{margin},{margin},1
Style: Eyebrow,DejaVu Sans,{spec['eyebrow_size']},&H00BCC3C9,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,4,0,1,0,0,8,{margin},{margin},0,1
Style: Title,DejaVu Serif,{spec['title_size']},&H00F3EFE7,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,-1,0,1,0,0,5,{int(width * .11)},{int(width * .11)},0,1
Style: Body,DejaVu Serif,{spec['body_size']},&H00C0C5CA,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,8,{int(width * .18)},{int(width * .18)},0,1
Style: Footer,DejaVu Sans,{max(16, int(width * .009))},&H009AA3AC,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,1,{margin},{margin},{margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    title = ass_escape(str(payload.get("title", "Pathway")).upper())
    lines.append(f"Dialogue: 0,{ass_time(0)},{ass_time(duration)},Path,,0,0,0,,{{\\pos({width - margin},{margin + 8})}}{title} · PATHWAY\n")

    cues = payload.get("timeline") if isinstance(payload.get("timeline"), list) else []
    for index, cue in enumerate(cues):
        if not isinstance(cue, dict):
            continue
        start = max(0.0, float(cue.get("start", 0) or 0))
        next_start = float(cues[index + 1].get("start", duration)) if index + 1 < len(cues) and isinstance(cues[index + 1], dict) else duration
        end = max(start + .1, min(duration, next_start))
        kind = str(cue.get("kind", "scripture"))
        title_y = spec["brand_title_y"] if kind == "brand" else spec["title_y"]
        body_y = spec["brand_body_y"] if kind == "brand" else spec["body_y"]
        eyebrow_y = title_y - (int(height * .08) if kind == "brand" else int(height * .18))

        if kind != "brand":
            lines.append(f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Eyebrow,,0,0,0,,{{\\pos({width // 2},{eyebrow_y})\\fad(350,350)}}{ass_escape(cue.get('eyebrow', ''))}\n")
        lines.append(f"Dialogue: 2,{ass_time(start)},{ass_time(end)},Title,,0,0,0,,{{\\pos({width // 2},{title_y})\\fad(350,350)}}{ass_escape(cue.get('title', ''))}\n")
        if cue.get("body"):
            lines.append(f"Dialogue: 1,{ass_time(start)},{ass_time(end)},Body,,0,0,0,,{{\\pos({width // 2},{body_y})\\fad(350,350)}}{ass_escape(cue.get('body', ''))}\n")
        lines.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Footer,,0,0,0,,{{\\pos({margin},{height - margin})}}{ass_escape(cue.get('reference', ''))}\n")

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


def update_render(job_id: str, values: dict) -> None:
    base = os.environ.get("VIDEO_STUDIO_SUPABASE_URL", "").rstrip("/")
    if not base:
        raise RuntimeError("VIDEO_STUDIO_SUPABASE_URL is missing from GitHub Actions secrets.")
    url = f"{base}/rest/v1/pathway_video_renders?id=eq.{urllib.parse.quote(job_id)}"
    supabase_request("PATCH", url, json.dumps(values).encode())


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
        cues = payload.get("timeline") if isinstance(payload.get("timeline"), list) else []
        brand_end = 0.0
        if len(cues) > 1 and isinstance(cues[0], dict) and cues[0].get("kind") == "brand" and isinstance(cues[1], dict):
            brand_end = max(0.0, float(cues[1].get("start", 0) or 0))

        filter_graph = (
            f"[0:a]asplit=2[aout][av];"
            f"[av]showfreqs=s={spec['spectrum_w']}x{spec['spectrum_h']}:mode=bar:ascale=log:fscale=log:win_size=1024:overlap=0.75:colors=0xD6DCE2@0.40,format=rgba,colorkey=black:0.12:0.08[spec];"
            f"color=c=0x080B0F:s={width}x{height}:d={duration}[bg];"
            f"[1:v]split=2[ls][lh];[ls]scale={spec['logo_small']}:-1[small];[lh]scale={spec['logo_hero']}:-1[hero];"
            f"[bg][small]overlay={spec['margin']}:{spec['margin']}:enable='gte(t,{brand_end})'[b1];"
            f"[b1][hero]overlay=(W-w)/2:{int(height * .39)}:enable='lt(t,{brand_end})'[b2];"
            f"[b2][spec]overlay=(W-w)/2:{spec['spectrum_y']}[b3];"
            f"[b3]ass='{timeline_ass}',drawbox=x=0:y={height - 3}:w='{width}*t/{duration}':h=3:color=0x6F8FB8@0.9:t=fill[v]"
        )

        run([
            "ffmpeg", "-y", "-i", str(audio), "-loop", "1", "-i", str(wordmark),
            "-filter_complex", filter_graph,
            "-map", "[v]", "-map", "[aout]", "-t", str(duration),
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(output),
        ])


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: render_pathway_video.py payload.json output.mp4")
    payload = json.loads(Path(sys.argv[1]).read_text())
    output = Path(sys.argv[2])
    job_id = str(payload.get("job_id", "")).strip()
    slug = str(payload.get("slug", "")).strip()
    video_format = str(payload.get("format", "youtube")).strip()
    if not job_id or not slug:
        raise SystemExit("Render payload is missing job_id or slug.")

    try:
        update_render(job_id, {"status": "rendering", "started_at": dt.datetime.now(dt.timezone.utc).isoformat(), "error": None})
        render(payload, output)
        storage_path, public_url = upload_render(output, slug, job_id, video_format)
        update_render(job_id, {
            "status": "completed",
            "storage_path": storage_path,
            "output_url": public_url,
            "completed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "error": None,
        })
        print(public_url)
    except Exception as error:
        try:
            update_render(job_id, {"status": "failed", "error": str(error)[:1800], "completed_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        except Exception as status_error:
            print(f"Could not update failed render status: {status_error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
