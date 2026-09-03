#!/usr/bin/env python3
import importlib.util
import os
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FINISH_PATH = os.path.join(ROOT, "scripts", "render_video_producer_finishing_worker.py")
THUMB_PATH = os.path.join(ROOT, "scripts", "video_producer_thumbnail_worker.py")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def probe(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "default=nw=1", path
    ], text=True)
    return out


def source(path):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=6",
        "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=6",
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", path
    ], check=True)


def music(path):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=6",
        "-filter:a", "volume=0.12", "-c:a", "pcm_s16le", path
    ], check=True)


def visible(start, end):
    return [{"sourceStart": start, "sourceEnd": end, "outputStart": start, "outputEnd": end}]


def manifest(music_path):
    return {
        "version": 1,
        "project": {
            "id": "finishing-smoke", "title": "God Is One Smoke", "mode": "podcast",
            "pathway": {
                "slug": "god-is-one", "title": "God Is One", "summary": "Begin with Scripture's controlling confession of one indivisible God.",
                "steps": [
                    {"title": "Begin with the confession", "reference": "Deuteronomy 6:4", "explanation": "Israel's central confession names the LORD as one."},
                    {"title": "No God before or after", "reference": "Isaiah 43:10", "explanation": "The LORD denies any formed God before Him or after Him."}
                ]
            }
        },
        "source": {"filename": "source.mp4", "duration": 6, "range": None},
        "brand": {"wordmark": "public/brand/apostolic-guide-wordmark-reversed.png"},
        "transcript": {"text": "", "duration": 6, "segments": [], "words": []},
        "musicTracks": [{"id": "music", "title": "Smoke Bed", "localPath": music_path, "gainDb": -28, "duckUnderVoice": True}],
        "renderPlan": {
            "version": 2, "mode": "podcast", "sourceDuration": 6, "outputDuration": 6,
            "keepSegments": [{"start": 0, "end": 6}],
            "overlays": [
                {"id": "path", "kind": "pathway", "start": .2, "duration": .6, "title": "GOD IS ONE PATHWAY", "body": "Follow along through the Scriptures", "reference": None, "animation": "rise", "placement": "lower-third", "outputStart": .2, "outputRanges": visible(.2,.8)},
                {"id": "chapter", "kind": "chapter", "start": .9, "duration": .7, "title": "THE CONTROLLING CONFESSION", "body": None, "reference": "Deuteronomy 6:4", "animation": "wipe", "placement": "full-frame", "outputStart": .9, "outputRanges": visible(.9,1.6)},
                {"id": "verse-short", "kind": "scripture", "start": 1.8, "duration": .8, "title": "The Lord our God is one.", "body": None, "reference": "Deuteronomy 6:4", "animation": "fade", "placement": "lower-third", "outputStart": 1.8, "outputRanges": visible(1.8,2.6)},
                {"id": "verse-long", "kind": "scripture", "start": 3.0, "duration": .8, "title": "Before me there was no God formed, neither shall there be after me.", "body": None, "reference": "Isaiah 43:10", "animation": "fade", "placement": "lower-third", "outputStart": 3.0, "outputRanges": visible(3.0,3.8)}
            ],
            "motion": [],
            "music": [{"id":"ag-music-bed","trackId":"music","start":0,"end":6,"gainDb":-28,"duckUnderVoice":True,"outputRanges":visible(0,6)}],
            "captions": {"enabled": False, "style":"minimal", "animation":"none", "maxWordsPerCard":8, "position":"lower", "highlightCurrentWord":False},
            "audioPreset":"ag-voice-clean", "colorPreset":"ag-studio", "intro":False, "outro":False,
            "output":{"format":"mp4","width":1920,"height":1080,"fps":30}
        }
    }


def reel_manifest():
    return {
        "version": 1,
        "project": {"id": "reel-motion-smoke", "title": "Opening Hook Smoke", "mode": "reels", "pathway": None},
        "source": {"filename": "source.mp4", "duration": 6, "range": None},
        "brand": {"wordmark": "public/brand/apostolic-guide-wordmark-reversed.png"},
        "transcript": {"text": "", "duration": 6, "segments": [], "words": []},
        "musicTracks": [],
        "renderPlan": {
            "version": 2, "mode": "reels", "sourceDuration": 6, "outputDuration": 6,
            "keepSegments": [{"start": 0, "end": 6}],
            "overlays": [
                {"id":"opening-hook","kind":"statement","start":.2,"duration":2.2,"title":"DID JESUS PRESERVE ISRAEL'S CONFESSION?","body":None,"reference":None,"animation":"rise","placement":"center","outputStart":.2,"outputRanges":visible(.2,2.4)}
            ],
            "motion": [
                {"id":"m1","kind":"punch-in","start":0,"duration":1.2,"intensity":"subtle","transform":{"scale":1.08,"focusX":.5,"focusY":.42},"outputRanges":visible(0,1.2)},
                {"id":"m2","kind":"punch-in","start":2.4,"duration":1.0,"intensity":"medium","transform":{"scale":1.13,"focusX":.55,"focusY":.4},"outputRanges":visible(2.4,3.4)},
                {"id":"m3","kind":"punch-in","start":4.4,"duration":1.2,"intensity":"subtle","transform":{"scale":1.1,"focusX":.48,"focusY":.45},"outputRanges":visible(4.4,5.6)}
            ],
            "music": [],
            "captions": {"enabled":False,"style":"kinetic-clean","animation":"highlight","maxWordsPerCard":5,"position":"lower","highlightCurrentWord":True},
            "audioPreset":"ag-voice-punch", "colorPreset":"ag-clean", "intro":False, "outro":False,
            "output":{"format":"mp4","width":1080,"height":1920,"fps":30}
        }
    }


def main():
    os.chdir(ROOT)
    finishing = load("finishing_smoke", FINISH_PATH)
    thumbnail = load("thumbnail_smoke", THUMB_PATH)
    with tempfile.TemporaryDirectory(prefix="ag-finishing-smoke-") as d:
        src = os.path.join(d, "source.mp4")
        bed = os.path.join(d, "music.wav")
        ass = os.path.join(d, "graphics.ass")
        out = os.path.join(d, "master.mp4")
        reel_ass = os.path.join(d, "reel-graphics.ass")
        reel_out = os.path.join(d, "reel.mp4")
        thumb = os.path.join(d, "thumb.jpg")
        source(src); music(bed)

        m = manifest(bed)
        finishing.bw.base.validate_manifest(m)
        finishing.build_broadcast_ass_v2(m, ass)
        subprocess.run(finishing.build_ffmpeg_v2(m, src, ass, out), check=True)
        if not os.path.exists(out) or os.path.getsize(out) < 1024:
            raise RuntimeError("finishing smoke master missing")
        with open(ass, "r", encoding="utf-8") as handle:
            text = handle.read()

        # Broadcast Graphics / 03 must preserve pathway + Scripture orientation while
        # rejecting the old persistent follower and generic Scripture-card labels.
        for expected in [
            "AG / PATHWAY STOP",
            "GOD IS ONE PATHWAY",
            "AG / SECTION",
            "THE CONTROLLING CONFESSION",
            "DEUTERONOMY 6:4",
            "The Lord our God is one.",
            "ISAIAH 43:10",
            "Before me there was no God formed, neither shall there be after me."
        ]:
            if expected not in text:
                raise RuntimeError(f"Broadcast Graphics 03 ASS missing {expected}")
        for forbidden in ["PATHWAY STOP 1", "AG / SCRIPTURE"]:
            if forbidden in text:
                raise RuntimeError(f"Broadcast Graphics 03 reintroduced old card language: {forbidden}")
        for token, label in [("3D2DA1", "crimson"), ("F4F7F5", "paper"), ("2A2010", "ink")]:
            if token not in text:
                raise RuntimeError(f"Broadcast Graphics 03 ASS is missing canonical AG {label}")

        reel = reel_manifest()
        finishing.bw.base.validate_manifest(reel)
        finishing.build_broadcast_ass_v2(reel, reel_ass)
        reel_command = finishing.build_ffmpeg_v2(reel, src, reel_ass, reel_out)
        if "zoompan" in " ".join(reel_command):
            raise RuntimeError("Reel finishing smoke still contains the expensive zoompan filter")
        subprocess.run(reel_command, check=True)
        reel_probe = probe(reel_out)
        if "width=1080" not in reel_probe or "height=1920" not in reel_probe:
            raise RuntimeError(f"Reel finishing smoke has wrong geometry: {reel_probe}")
        if not os.path.exists(reel_out) or os.path.getsize(reel_out) < 1024:
            raise RuntimeError("Reel segmented-motion smoke output missing")

        thumbnail.render_variant(src, "face-hook", "ONE GOD", "God Is One", 2.0, thumb, d)
        if not os.path.exists(thumb) or os.path.getsize(thumb) < 1024:
            raise RuntimeError("thumbnail smoke output missing")
        print(probe(out))
        print(reel_probe)
        print("Video Producer finishing smoke passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"::error title=Video Producer finishing smoke::{type(error).__name__}: {error}", flush=True)
        raise
