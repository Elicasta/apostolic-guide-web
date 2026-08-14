#!/usr/bin/env python3
import importlib.util
import json
import os
import subprocess
import tempfile


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_broadcast_worker.py")
SPEC = importlib.util.spec_from_file_location("video_producer_worker", WORKER_PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


def probe(path):
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration",
        "-of", "json", path
    ], text=True)
    return json.loads(raw)


def create_source(path):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=4",
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", path
    ], check=True)


def visible(start, end):
    return [{"sourceStart": start, "sourceEnd": end, "outputStart": start, "outputEnd": end}]


def reel_manifest():
    return {
        "version": 1,
        "project": {"id": "smoke", "title": "Smoke Reel", "mode": "reels"},
        "source": {"filename": "source.mp4", "duration": 4, "range": None},
        "brand": {"wordmark": "public/brand/apostolic-guide-wordmark-reversed.png"},
        "transcript": {
            "text": "Jesus is Lord",
            "duration": 4,
            "segments": [{"text": "Jesus is Lord", "start": 0.2, "end": 2.8}],
            "words": [
                {"word": "Jesus", "start": 0.2, "end": 0.7},
                {"word": "is", "start": 0.75, "end": 1.0},
                {"word": "Lord", "start": 2.1, "end": 2.7}
            ]
        },
        "renderPlan": {
            "version": 2,
            "mode": "reels",
            "sourceDuration": 4,
            "outputDuration": 3.5,
            "keepSegments": [{"start": 0, "end": 1.5}, {"start": 2, "end": 4}],
            "overlays": [{
                "id": "verse", "kind": "scripture", "start": 0.3, "duration": 0.8,
                "title": "Hear, O Israel: the Lord our God is one Lord.", "reference": "Deuteronomy 6:4 / KJV",
                "animation": "rise", "placement": "center", "outputStart": 0.3,
                "outputRanges": [{"sourceStart": 0.3, "sourceEnd": 1.1, "outputStart": 0.3, "outputEnd": 1.1}]
            }],
            "motion": [{
                "id": "push", "kind": "punch-in", "start": 0.5, "duration": 0.6, "intensity": "subtle",
                "transform": {"focusX": 0.5, "focusY": 0.45, "scale": 1.08}, "outputStart": 0.5,
                "outputRanges": [{"sourceStart": 0.5, "sourceEnd": 1.1, "outputStart": 0.5, "outputEnd": 1.1}]
            }],
            "music": [],
            "captions": {"enabled": True, "style": "kinetic-clean", "animation": "highlight", "maxWordsPerCard": 5, "position": "lower", "highlightCurrentWord": True},
            "audioPreset": "ag-voice-punch",
            "colorPreset": "ag-clean",
            "intro": False,
            "outro": False,
            "output": {"format": "mp4", "width": 1080, "height": 1920, "fps": 30}
        }
    }


def podcast_manifest():
    overlays = [
        {"id": "host", "kind": "lower-third", "start": 0.10, "duration": 0.45, "title": "ELI CASTANEDA", "body": "HOST", "animation": "slide", "placement": "lower-third", "outputStart": 0.10, "outputRanges": visible(0.10, 0.55)},
        {"id": "path", "kind": "pathway", "start": 0.58, "duration": 0.42, "title": "GOD IS ONE PATHWAY", "body": "Follow along through the Scriptures", "animation": "rise", "placement": "lower-third", "outputStart": 0.58, "outputRanges": visible(0.58, 1.00)},
        {"id": "verse-lower", "kind": "scripture", "start": 1.02, "duration": 0.48, "title": "Hear, O Israel: The Lord our God is one Lord.", "reference": "Deuteronomy 6:4 / KJV", "animation": "fade", "placement": "lower-third", "outputStart": 1.02, "outputRanges": visible(1.02, 1.50)},
        {"id": "point", "kind": "statement", "start": 1.52, "duration": 0.48, "title": "SCRIPTURE FIRST. QUESTIONS WELCOME.", "animation": "pop", "placement": "center", "outputStart": 1.52, "outputRanges": visible(1.52, 2.00)},
        {"id": "quote", "kind": "quote", "start": 2.02, "duration": 0.48, "title": "Truth over trend", "body": "Apostolic Guide", "animation": "fade", "placement": "center", "outputStart": 2.02, "outputRanges": visible(2.02, 2.50)},
        {"id": "chapter", "kind": "chapter", "start": 2.52, "duration": 0.48, "title": "FOUNDATIONS", "animation": "wipe", "placement": "full-frame", "outputStart": 2.52, "outputRanges": visible(2.52, 3.00)},
        {"id": "cta", "kind": "cta", "start": 3.05, "duration": 0.75, "title": "KEEP FOLLOWING THE BIBLICAL CASE", "body": "apostolicguide.com", "animation": "slide", "placement": "lower-third", "outputStart": 3.05, "outputRanges": visible(3.05, 3.80)}
    ]
    return {
        "version": 1,
        "project": {"id": "smoke", "title": "Smoke Podcast", "mode": "podcast"},
        "source": {"filename": "source.mp4", "duration": 4, "range": None},
        "brand": {"wordmark": "public/brand/apostolic-guide-wordmark-reversed.png"},
        "transcript": {"text": "", "duration": 4, "segments": [], "words": []},
        "renderPlan": {
            "version": 2,
            "mode": "podcast",
            "sourceDuration": 4,
            "outputDuration": 4,
            "keepSegments": [{"start": 0, "end": 4}],
            "overlays": overlays, "motion": [], "music": [],
            "captions": {"enabled": False, "style": "minimal", "animation": "none", "maxWordsPerCard": 8, "position": "lower", "highlightCurrentWord": False},
            "audioPreset": "ag-voice-clean",
            "colorPreset": "ag-studio",
            "intro": True,
            "outro": True,
            "output": {"format": "mp4", "width": 1920, "height": 1080, "fps": 30}
        }
    }


def render(manifest, source, directory, stem):
    ass_path = os.path.join(directory, stem + ".ass")
    main_path = os.path.join(directory, stem + "-main.mp4")
    final_path = os.path.join(directory, stem + ".mp4")
    worker.validate_manifest(manifest)
    worker.build_ass(manifest, ass_path)
    subprocess.run(worker.build_ffmpeg(manifest, source, ass_path, main_path), check=True)
    worker.package_with_bumpers(manifest, main_path, final_path, directory)
    if not os.path.exists(final_path) or os.path.getsize(final_path) < 1024:
        raise RuntimeError(stem + " smoke render did not create output")
    with open(ass_path, "r", encoding="utf-8") as handle:
        ass_text = handle.read()
    if "APOSTOLIC GUIDE" not in ass_text or "GOD IS ONE PATHWAY" not in ass_text and stem == "podcast":
        raise RuntimeError(stem + " smoke ASS did not contain AG broadcast graphics")
    return final_path


def main():
    os.chdir(ROOT)
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-smoke-") as directory:
        source = os.path.join(directory, "source.mp4")
        create_source(source)
        reel = render(reel_manifest(), source, directory, "reel")
        reel_probe = probe(reel)
        reel_video = next(stream for stream in reel_probe["streams"] if "width" in stream)
        assert (reel_video["width"], reel_video["height"]) == (1080, 1920), reel_probe

        podcast = render(podcast_manifest(), source, directory, "podcast")
        podcast_probe = probe(podcast)
        podcast_video = next(stream for stream in podcast_probe["streams"] if "width" in stream)
        assert (podcast_video["width"], podcast_video["height"]) == (1920, 1080), podcast_probe
        assert float(podcast_probe["format"]["duration"]) > 6.5, podcast_probe
        print("Video Producer AG broadcast graphics smoke test passed")


if __name__ == "__main__":
    main()
