#!/usr/bin/env python3
"""Smoke test for Apostolic Guide Kinetic Graphics / 02."""
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
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=9",
        "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=9",
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
        kinetic("impact", .4, 1.4, "ONE GOD", "THE SCRIPTURE STARTS HERE"),
        kinetic("split", 2.0, 1.5, "ONE GOD", "REVEALED IN JESUS"),
        kinetic("band", 3.8, 1.1, "THE WORD"),
        kinetic("stack", 5.1, 1.5, "THE WORD", "WAS WITH GOD | WAS GOD | BECAME FLESH"),
        kinetic("question-stack", 6.9, 1.6, "WATCH THE TEXT", "WHAT PREEXISTED? | WHEN DID THE SON BEGIN?")
    ]
    return {
        "version": 1,
        "project": {"id": "kinetic-smoke", "title": "Kinetic Smoke", "mode": "podcast", "pathway": None},
        "source": {"filename": "source.mp4", "duration": 9, "range": None},
        "brand": {},
        "transcript": {"text": "", "duration": 9, "segments": [], "words": []},
        "musicTracks": [],
        "renderPlan": {
            "version": 2, "mode": "podcast", "sourceDuration": 9, "outputDuration": 9,
            "keepSegments": [{"start": 0, "end": 9}],
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
        # Kinetic copy is intentionally wrapped with ASS \\N breaks. Normalize those
        # display breaks before asserting the authored phrases so this tests content,
        # not one specific line-wrap decision.
        searchable = text.replace("\\N", " ")
        for expected in [
            "ONE GOD", "THE SCRIPTURE STARTS HERE", "REVEALED IN JESUS", "THE WORD",
            "WAS WITH GOD", "WAS GOD", "BECAME FLESH", "WATCH THE TEXT",
            "WHAT PREEXISTED?", "WHEN DID THE SON BEGIN?"
        ]:
            if expected not in searchable:
                raise RuntimeError(f"kinetic ASS missing {expected}")
        for token, label in [("3D2DA1", "crimson"), ("F4F7F5", "paper"), ("2A2010", "ink")]:
            if token not in text:
                raise RuntimeError(f"kinetic ASS is missing the canonical AG {label} token")
        if "\\move(" not in text or "\\fscx108" not in text:
            raise RuntimeError("kinetic ASS is missing expected Motion 02 movement primitives")
        if "\\frz" in text:
            raise RuntimeError("kinetic ASS reintroduced rotated slash/scribble decoration")
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
        print("Video Producer kinetic smoke passed: A-roll phrase -> moving AG field -> editorial composition -> A-roll.")


if __name__ == "__main__":
    main()
