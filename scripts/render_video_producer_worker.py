#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import urllib.request


def callback(payload, status, progress=None, stage=None, error=None):
    body = {
        "job_id": payload["job_id"],
        "token": payload["callback_token"],
        "status": status,
    }
    if progress is not None:
        body["progress"] = int(progress)
    if stage:
        body["stage"] = stage
    if error:
        body["error"] = str(error)[:3000]
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-worker"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback failed ({response.status})")


def download(url, target):
    request = urllib.request.Request(url, headers={"user-agent": "apostolic-guide-video-producer-worker"})
    with urllib.request.urlopen(request, timeout=300) as response, open(target, "wb") as out:
        while True:
            chunk = response.read(2 * 1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def ass_time(seconds):
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def ass_escape(value):
    return str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def map_word_to_output(word, keep_segments):
    start = float(word.get("start", 0))
    end = float(word.get("end", start))
    midpoint = (start + end) / 2
    cursor = 0.0
    for segment in keep_segments:
        seg_start = float(segment["start"])
        seg_end = float(segment["end"])
        if seg_start <= midpoint < seg_end or (midpoint == seg_end and segment is keep_segments[-1]):
            mapped_start = cursor + max(0.0, start - seg_start)
            mapped_end = cursor + min(seg_end - seg_start, max(0.02, end - seg_start))
            if mapped_end <= mapped_start:
                mapped_end = mapped_start + 0.04
            return {"word": str(word.get("word") or "").strip(), "start": mapped_start, "end": mapped_end}
        cursor += seg_end - seg_start
    return None


def caption_groups(words, max_words):
    groups = []
    current = []
    for word in words:
        if not word["word"]:
            continue
        if current and (len(current) >= max_words or word["start"] - current[-1]["end"] > 0.8 or word["end"] - current[0]["start"] > 3.2):
            groups.append(current)
            current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def caption_markup(group, active_index, style, highlight):
    parts = []
    for index, word in enumerate(group):
        value = ass_escape(word["word"])
        if highlight and index == active_index:
            if style == "word-pop":
                value = "{\\c&H00FF8D4C&\\fscx116\\fscy116}" + value + "{\\rCaption}"
            else:
                value = "{\\c&H00FF8D4C&}" + value + "{\\rCaption}"
        parts.append(value)
    return " ".join(parts)


def overlay_position(placement, width, height):
    if placement == "top":
        return 8, width / 2, 180
    if placement == "center" or placement == "full-frame":
        return 5, width / 2, height / 2
    return 2, width / 2, height - (280 if height > 1200 else 150)


def build_ass(manifest, target):
    plan = manifest["renderPlan"]
    output = plan["output"]
    width, height = int(output["width"]), int(output["height"])
    captions = plan.get("captions") or {}
    caption_size = 76 if height > 1200 else 42
    if captions.get("style") == "editorial":
        caption_size = 86 if height > 1200 else 48
    elif captions.get("style") == "minimal":
        caption_size = 62 if height > 1200 else 36
    margin_v = 260 if height > 1200 else 110
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
        f"Style: Caption,Noto Sans,{caption_size},&H00FFFFFF,&H00FFFFFF,&H0006070B,&H80000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,{margin_v},1",
        f"Style: Overlay,Noto Sans,{54 if height > 1200 else 34},&H00FFFFFF,&H00FFFFFF,&H0006070B,&HAA05070B,-1,0,0,0,100,100,0,0,3,3,0,5,80,80,80,1",
        f"Style: Brand,Noto Sans,{24 if height > 1200 else 18},&H00FFFFFF,&H00FFFFFF,&H0006070B,&H00000000,-1,0,0,0,100,100,2,0,1,2,0,7,28,28,28,1",
        "",
        "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]

    if captions.get("enabled"):
        mapped = []
        for word in (manifest.get("transcript") or {}).get("words") or []:
            item = map_word_to_output(word, plan.get("keepSegments") or [])
            if item:
                mapped.append(item)
        max_words = max(2, min(10, int(captions.get("maxWordsPerCard") or 5)))
        style = captions.get("style") or "kinetic-clean"
        highlight = bool(captions.get("highlightCurrentWord"))
        animation = captions.get("animation") or "none"
        for group in caption_groups(mapped, max_words):
            for index, word in enumerate(group):
                start = word["start"]
                end = group[index + 1]["start"] if index + 1 < len(group) else max(word["end"], start + 0.18)
                anim_tag = "{\\fad(60,70)}" if animation in ("rise", "pop") else ""
                text = anim_tag + caption_markup(group, index, style, highlight)
                lines.append(f"Dialogue: 2,{ass_time(start)},{ass_time(end)},Caption,,0,0,0,,{text}")

    for cue in plan.get("overlays") or []:
        title = str(cue.get("title") or "").strip()
        if not title:
            continue
        body = str(cue.get("body") or cue.get("reference") or "").strip()
        wrap_width = 28 if height > 1200 else 42
        title_text = "\\N".join(textwrap.wrap(title.upper(), width=wrap_width)[:3])
        body_text = "\\N".join(textwrap.wrap(body, width=wrap_width + 8)[:3]) if body else ""
        content = ass_escape(title_text).replace("\\\\N", "\\N")
        if body_text:
            content += "\\N{\\fs" + str(34 if height > 1200 else 24) + "\\b0}" + ass_escape(body_text).replace("\\\\N", "\\N")
        animation = cue.get("animation") or "fade"
        prefix = "{\\fad(120,160)}" if animation != "none" else ""
        an, x, y = overlay_position(cue.get("placement"), width, height)
        prefix += f"{{\\an{an}\\pos({int(x)},{int(y)})}}"
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart", 0))
            end = float(visible.get("outputEnd", start))
            if end > start:
                lines.append(f"Dialogue: 3,{ass_time(start)},{ass_time(end)},Overlay,,0,0,0,,{prefix}{content}")

    output_duration = float(plan.get("outputDuration") or 0)
    if output_duration > 0:
        lines.append(f"Dialogue: 1,{ass_time(0)},{ass_time(output_duration)},Brand,,0,0,0,,APOSTOLIC GUIDE")
    with open(target, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def zoompan_filter(plan):
    cues = []
    for cue in plan.get("motion") or []:
        if cue.get("kind") not in ("punch-in", "reframe", "emphasis"):
            continue
        transform = cue.get("transform") or {}
        scale = max(1.0, min(1.5, float(transform.get("scale") or (1.08 if cue.get("kind") == "punch-in" else 1.0))))
        fx = max(0.0, min(1.0, float(transform.get("focusX") or 0.5)))
        fy = max(0.0, min(1.0, float(transform.get("focusY") or 0.5)))
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart", 0))
            end = float(visible.get("outputEnd", start))
            if end > start and scale > 1.001:
                cues.append((start, end, scale, fx, fy))
    if not cues:
        return None

    def nested(index, field, default):
        if index >= len(cues):
            return str(default)
        start, end, scale, fx, fy = cues[index]
        value = {"z": scale, "x": fx, "y": fy}[field]
        return f"if(between(on,{round(start * 30)},{round(end * 30)}),{value},{nested(index + 1, field, default)})"

    z = nested(0, "z", 1)
    fx = nested(0, "x", 0.5)
    fy = nested(0, "y", 0.5)
    return f"zoompan=z='{z}':x='(iw-iw/zoom)*({fx})':y='(ih-ih/zoom)*({fy})':d=1:s=1080x1920:fps=30"


def color_filter(plan):
    preset = plan.get("colorPreset") or "none"
    if preset == "ag-studio":
        return "eq=contrast=1.04:saturation=1.03:brightness=0.003"
    if preset == "ag-warm":
        return "eq=contrast=1.035:saturation=1.045:brightness=0.004:gamma_r=1.025:gamma_b=0.985"
    if preset == "ag-clean":
        return "eq=contrast=1.025:saturation=1.035:brightness=0.002"
    return "null"


def audio_filter(plan):
    preset = plan.get("audioPreset") or "none"
    tail = "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
    if preset == "ag-voice-punch":
        return "highpass=f=80,equalizer=f=3000:t=q:w=1:g=1.2,acompressor=threshold=-22dB:ratio=3.2:attack=8:release=120,alimiter=limit=0.94,loudnorm=I=-14:TP=-1:LRA=7," + tail
    if preset == "ag-voice-clean":
        return "highpass=f=70,equalizer=f=250:t=q:w=1:g=-1.5,acompressor=threshold=-20dB:ratio=2.5:attack=15:release=180,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=9," + tail
    return tail


def build_ffmpeg(manifest, source, ass_file, output_file):
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
        video_chain = "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='(iw-1080)*0.5':y='(ih-1920)*0.5'"
        zoom = zoompan_filter(plan)
        if zoom:
            video_chain += "," + zoom
    else:
        video_chain = "fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
    video_chain += "," + color_filter(plan)
    graph.append(f"[vcat]{video_chain},ass='{ass_file}'[vout]")
    graph.append(f"[acat]{audio_filter(plan)}[aout]")

    command += [
        "-filter_complex", ";".join(graph),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "19" if mode == "reels" else "18",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-movflags", "+faststart", "-r", "30", output_file
    ]
    return command


def make_bumper(manifest, output_file, duration, outro=False):
    plan = manifest["renderPlan"]
    output = plan["output"]
    width, height = int(output["width"]), int(output["height"])
    brand = manifest.get("brand") or {}
    wordmark = brand.get("wordmark") or "public/brand/apostolic-guide-wordmark-reversed.png"
    if not os.path.exists(wordmark):
        raise RuntimeError(f"brand wordmark not found: {wordmark}")
    logo_width = 760 if width > height else 720
    subtitle = "APOSTOLICGUIDE.COM" if outro else "SCRIPTURE · DOCTRINE · STUDY"
    fade_out_start = max(0.2, duration - 0.3)
    graph = (
        f"[1:v]scale={logo_width}:-1[logo];"
        f"[0:v][logo]overlay=(W-w)/2:(H-h)/2-28,"
        f"drawtext=font='Noto Sans':text='{subtitle}':fontcolor=white@0.62:fontsize={28 if width > height else 34}:"
        f"x=(w-text_w)/2:y=(h/2)+120:tracking=5,"
        f"fade=t=in:st=0:d=0.22,fade=t=out:st={fade_out_start:.2f}:d=0.28,format=yuv420p[v];"
        f"[2:a]afade=t=in:st=0:d=0.12,afade=t=out:st={fade_out_start:.2f}:d=0.25,"
        "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a]"
    )
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-f", "lavfi", "-i", f"color=c=0x05070b:s={width}x{height}:r=30:d={duration}",
        "-loop", "1", "-i", wordmark,
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-filter_complex", graph,
        "-map", "[v]", "-map", "[a]", "-t", str(duration),
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output_file
    ], check=True)


def package_with_bumpers(manifest, main_file, final_file, directory):
    plan = manifest["renderPlan"]
    parts = []
    if plan.get("intro"):
        intro_file = os.path.join(directory, "intro.mp4")
        make_bumper(manifest, intro_file, 1.8, outro=False)
        parts.append(intro_file)
    parts.append(main_file)
    if plan.get("outro"):
        outro_file = os.path.join(directory, "outro.mp4")
        make_bumper(manifest, outro_file, 1.6, outro=True)
        parts.append(outro_file)
    if len(parts) == 1:
        shutil.copy2(main_file, final_file)
        return

    command = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-y"]
    for part in parts:
        command += ["-i", part]
    graph = []
    inputs = []
    for index in range(len(parts)):
        graph.append(f"[{index}:v]fps=30,setpts=PTS-STARTPTS[v{index}]")
        graph.append(f"[{index}:a]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS[a{index}]")
        inputs.append(f"[v{index}][a{index}]")
    graph.append("".join(inputs) + f"concat=n={len(parts)}:v=1:a=1[vout][aout]")
    command += [
        "-filter_complex", ";".join(graph), "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", final_file
    ]
    subprocess.run(command, check=True)


def upload_file(url, path):
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--request", "PUT",
        "--header", "content-type: video/mp4", "--upload-file", path, url
    ], check=True)


def validate_manifest(manifest):
    if manifest.get("version") != 1:
        raise RuntimeError("unsupported manifest version")
    plan = manifest.get("renderPlan") or {}
    if plan.get("version") != 2 or plan.get("mode") not in ("podcast", "reels"):
        raise RuntimeError("invalid render plan")
    output = plan.get("output") or {}
    expected = (1080, 1920) if plan.get("mode") == "reels" else (1920, 1080)
    if (int(output.get("width") or 0), int(output.get("height") or 0)) != expected:
        raise RuntimeError("render geometry does not match producer mode")
    if float(plan.get("outputDuration") or 0) <= 0:
        raise RuntimeError("render output duration is empty")
    if plan.get("audioPreset") not in ("ag-voice-clean", "ag-voice-punch", "none"):
        raise RuntimeError("unsupported audio preset")
    if plan.get("colorPreset") not in ("ag-studio", "ag-warm", "ag-clean", "none"):
        raise RuntimeError("unsupported color preset")


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_worker.py payload.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "source_url", "manifest_url", "output_upload_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    callback(payload, "rendering", 2, "Downloading render manifest")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-render-") as directory:
        manifest_path = os.path.join(directory, "manifest.json")
        source_path = os.path.join(directory, "source-video")
        ass_path = os.path.join(directory, "graphics.ass")
        main_path = os.path.join(directory, "main.mp4")
        download(payload["manifest_url"], manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        validate_manifest(manifest)
        callback(payload, "rendering", 6, "Downloading source video")
        download(payload["source_url"], source_path)
        callback(payload, "rendering", 12, "Building captions and graphics")
        build_ass(manifest, ass_path)
        callback(payload, "rendering", 18, "Rendering approved edit")
        subprocess.run(build_ffmpeg(manifest, source_path, ass_path, main_path), check=True)
        if not os.path.exists(main_path) or os.path.getsize(main_path) < 1024:
            raise RuntimeError("ffmpeg completed without a usable main render")
        callback(payload, "rendering", 82, "Packaging branded intro and outro")
        package_with_bumpers(manifest, main_path, sys.argv[2], directory)
        if not os.path.exists(sys.argv[2]) or os.path.getsize(sys.argv[2]) < 1024:
            raise RuntimeError("Video Producer package did not create a usable output file")
        callback(payload, "rendering", 94, "Uploading finished master")
        upload_file(payload["output_upload_url"], sys.argv[2])
        callback(payload, "completed", 100, "Ready to review")


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
                callback(payload, "failed", 100, "Render failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr)
        raise
