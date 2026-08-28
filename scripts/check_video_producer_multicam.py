#!/usr/bin/env python3
import importlib.util
import os
import subprocess
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RENDER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_multicam_worker.py")
ANALYZE_PATH = os.path.join(ROOT, "scripts", "analyze_video_producer_multicam.py")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def video(path, color, tone):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=640x360:r=30:d=6", "-f", "lavfi", "-i", f"sine=frequency={tone}:sample_rate=48000:duration=6", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", path], check=True)


def audio(path):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=6", "-c:a", "pcm_s16le", path], check=True)


def manifest(camera_b, external):
    return {
        "version": 1,
        "project": {"id": "multicam-smoke", "title": "Multicam Smoke", "mode": "podcast", "pathway": None},
        "source": {"filename": "a.mp4", "duration": 6, "range": None},
        "brand": {"wordmark": "public/brand/apostolic-guide-wordmark-reversed.png"},
        "transcript": {"text": "", "duration": 6, "segments": [], "words": []},
        "musicTracks": [],
        "multicam": {
            "version": 1,
            "cameras": [{"id": "camera-b", "locator": "camera-b", "duration": 6, "offsetMs": 0, "localPath": camera_b}],
            "externalAudio": {"locator": "external", "duration": 6, "offsetMs": 0, "localPath": external},
            "editDecisions": [
                {"sourceId": "camera-a", "start": 0, "end": 2},
                {"sourceId": "camera-b", "start": 2, "end": 4},
                {"sourceId": "camera-a", "start": 4, "end": 6}
            ]
        },
        "renderPlan": {
            "version": 2, "mode": "podcast", "sourceDuration": 6, "outputDuration": 6,
            "keepSegments": [{"start": 0, "end": 6}], "overlays": [], "motion": [], "music": [],
            "captions": {"enabled": False, "style": "minimal", "animation": "none", "maxWordsPerCard": 8, "position": "lower", "highlightCurrentWord": False},
            "audioPreset": "none", "colorPreset": "none", "intro": False, "outro": False,
            "output": {"format": "mp4", "width": 1920, "height": 1080, "fps": 30}
        }
    }


def main():
    os.chdir(ROOT)
    renderer = load("multicam_renderer_smoke", RENDER_PATH)
    analyzer = load("multicam_analyzer_smoke", ANALYZE_PATH)
    with tempfile.TemporaryDirectory(prefix="ag-multicam-smoke-") as directory:
        camera_a = os.path.join(directory, "a.mp4")
        camera_b = os.path.join(directory, "b.mp4")
        external = os.path.join(directory, "external.wav")
        ass = os.path.join(directory, "graphics.ass")
        output = os.path.join(directory, "output.mp4")
        video(camera_a, "blue", 220)
        video(camera_b, "red", 220)
        audio(external)
        value = manifest(camera_b, external)
        renderer.fw.bw.base.validate_manifest(value)
        renderer.fw.build_broadcast_ass_v2(value, ass)
        subprocess.run(renderer.build_ffmpeg_multicam(value, camera_a, ass, output), check=True)
        probe = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-show_entries", "format=duration", "-of", "default=nw=1", output], text=True)
        if "width=1920" not in probe or "height=1080" not in probe or not os.path.exists(output) or os.path.getsize(output) < 1024:
            raise RuntimeError(f"multicam render smoke failed: {probe}")

    rng = np.random.default_rng(42)
    primary = rng.normal(0, 1, 300).astype(np.float32)
    secondary = primary[20:].copy()
    lag_ms, score = analyzer.sync(primary, secondary)
    if abs(lag_ms - 5000) > 1 or score < 0.8:
        raise RuntimeError(f"waveform lag smoke failed: lag={lag_ms}, score={score}")
    print(probe)
    print("Video Producer multicam smoke passed")


if __name__ == "__main__":
    main()
