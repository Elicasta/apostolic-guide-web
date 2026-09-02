#!/usr/bin/env python3
"""Smoke test for Apostolic Guide Kinetic Graphics / 01."""
import importlib.util
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_visual_pass_worker.py")
SPEC = importlib.util.spec_from_file_location("ag_visual_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


def run(command):
    subprocess.run(command, check=True)


def source(path):
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=8",
        "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=8",
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", path
    ])


def visible(start, end):
    return [{"sourceStart": start, "sourceEnd": end, "outputStart": start, "outputEnd": end}]


def kinetic(kind, start, duration, title, body=None):
    return {
        "id": f"kinetic-{kind}", "kind": "kinetic", "start": start, "duration": duration,
        "title": title, "body": body, "reference": None, "animation": "pop",
        "placement": "full-frame", "treatment": kind, "outputStart": start,
        "outputRanges": visible(start, start + duration)
    }


def manifest():
    overlays = [
        kinetic("split", .4, 2.4, "ONE GOD", "REVEALED IN JESUS"),
        kinetic("strike", 3.0, 1.2, "ANOTHER GOD"),
        kinetic("band", 4.4, .9, "DISCOVERY"),
        kinetic("stack", 5.5, 1.0, "THE WORD", "BECAME FLESH"),
        kinetic("question-stack", 6.6, 1.0, "WATCH THE TEXT", "WHAT PREEXISTED? | WHEN DID THE SON BEGIN?")
    ]
    return {
        "version": 1,
        "project": {"id": "kinetic-smoke", "title": "Kinetic Smoke", "mode": "podcast", "pathway": None},
        "source": {"filename": "source.mp4", "duration": 8, "range": None},
        "brand": {},
        "transcript": {"text": "", "duration": 8, "segments": [], "words": []},
        "musicTracks": [],
        "renderPlan": {
            "version": 2, "mode": "podcast", "sourceDuration": 8, "outputDuration": 8,
            "keepSegments": [{"start": 0, "end": 8}],
            "overlays": overlays,
            "motion": [], "music": [],
            "captions": {"enabled": False, "style": "minimal", "animation": "none", "maxWordsPerCard": 8, "position": "lower", "highlightCurrentWord": False},
            "audioPreset": "none", "colorPreset": "none", "intro": False, "outro": False,
            "output": {"format": "mp4", "width": 1920, "height": 1080, "fps": 30}
        }
    }


def main():
    os.chdir(ROOT)
    with tempfile.TemporaryDirectory(prefix="ag-kinetic-smoke-") as directory:
        src = os.path.join(directory, "source.mp4")
        ass = os.path.join(directory, "graphics.ass")
        out = os.path.join(directory, "kinetic.mp4")
        source(src)
        m = manifest()
        worker.validate_manifest_v3(m)
        count = worker.build_graphics_ass(m, ass)
        if count != 5:
            raise RuntimeError(f"expected 5 kinetic ranges, got {count}")
        with open(ass, "r", encoding="utf-8") as handle:
            text = handle.read()
        for expected in [
            "ONE GOD", "REVEALED IN JESUS", "ANOTHER GOD", "DISCOVERY", "THE WORD",
            "BECAME FLESH", "WATCH THE TEXT", "WHAT PREEXISTED?", "WHEN DID THE SON BEGIN?"
        ]:
            if expected not in text:
                raise RuntimeError(f"kinetic ASS missing {expected}")
        if "2D21B3" not in text:
            raise RuntimeError("kinetic ASS is missing the AG deep-red token")
        if "\\move(" not in text or "\\fscx112" not in text:
            raise RuntimeError("kinetic ASS is missing expected motion primitives")
        command = worker.build_ffmpeg_v3(m, src, ass, out)
        run(command)
        if not os.path.exists(out) or os.path.getsize(out) < 1024:
            raise RuntimeError("kinetic smoke render missing")
        probe = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration",
            "-of", "default=nw=1", out
        ], text=True)
        if "width=1920" not in probe or "height=1080" not in probe:
            raise RuntimeError(f"kinetic smoke geometry is wrong: {probe}")
        print(probe)
        print("Video Producer kinetic smoke passed: A-roll text hit -> AG animated graphic card -> A-roll.")


if __name__ == "__main__":
    main()
