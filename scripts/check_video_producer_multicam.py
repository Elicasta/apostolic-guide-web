#!/usr/bin/env python3
import importlib.util
import json
import os
import subprocess
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "scripts", "render_video_producer_finishing_worker.py")
SPEC = importlib.util.spec_from_file_location("finish_worker", PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


def run(command):
    subprocess.run(command, check=True)


def make_camera(path, color, frequency, duration=14):
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", f"color=c={color}:s=1280x720:r=30:d={duration}",
        "-f", "lavfi", "-i", f"sine=frequency={frequency}:sample_rate=48000:duration={duration}",
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", path
    ])


def frame_rgb(path, second):
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(second), "-i", path,
        "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"
    ])
    return tuple(raw[:3])


def dominant_frequency(path):
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "2", "-t", "4", "-i", path,
        "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"
    ])
    samples = np.frombuffer(raw, dtype=np.float32)
    windowed = samples * np.hanning(len(samples))
    spectrum = np.abs(np.fft.rfft(windowed))
    frequencies = np.fft.rfftfreq(len(samples), d=1 / 8000)
    return float(frequencies[int(np.argmax(spectrum))])


with tempfile.TemporaryDirectory(prefix="ag-multicam-smoke-") as directory:
    camera_a = os.path.join(directory, "camera-a.mp4")
    camera_b = os.path.join(directory, "camera-b.mp4")
    external = os.path.join(directory, "external.wav")
    ass = os.path.join(directory, "graphics.ass")
    output = os.path.join(directory, "output.mp4")
    make_camera(camera_a, "blue", 440)
    make_camera(camera_b, "red", 660)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
        "sine=frequency=880:sample_rate=48000:duration=15", "-c:a", "pcm_s16le", external
    ])

    manifest = {
        "version": 2,
        "project": {"id": "smoke", "title": "Multicam Smoke", "mode": "podcast", "pathway": None},
        "source": {"filename": "camera-a.mp4", "duration": 14, "range": None},
        "renderPlan": {
            "version": 2,
            "mode": "podcast",
            "sourceDuration": 12,
            "outputDuration": 12,
            "keepSegments": [{"start": 0, "end": 12}],
            "overlays": [], "motion": [], "music": [],
            "captions": {"enabled": False, "style": "minimal", "animation": "none", "maxWordsPerCard": 8, "position": "lower", "highlightCurrentWord": False},
            "audioPreset": "none", "colorPreset": "none", "intro": False, "outro": False,
            "output": {"format": "mp4", "width": 1920, "height": 1080, "fps": 30}
        },
        "transcript": {"text": "", "duration": 12, "words": [], "segments": []},
        "musicTracks": [],
        "multicam": {
            "version": 1,
            "sourceRangeStart": 0,
            "cameraPlan": {"version": 1, "defaultCamera": "A", "decisions": []},
            "cameraRanges": [
                {"camera": "A", "start": 0, "end": 4, "outputStart": 0, "outputEnd": 4},
                {"camera": "B", "start": 4, "end": 8, "outputStart": 4, "outputEnd": 8},
                {"camera": "A", "start": 8, "end": 12, "outputStart": 8, "outputEnd": 12}
            ],
            "cameraB": {"assetId": "b", "duration": 14, "offsetSeconds": 1, "syncRevision": 1, "localPath": camera_b},
            "audioPlan": {"version": 1, "source": "external_audio", "assetId": "audio", "offsetSeconds": -1, "syncRevision": 1},
            "externalAudio": {"assetId": "audio", "duration": 15, "offsetSeconds": -1, "syncRevision": 1, "localPath": external}
        },
        "brand": {}
    }
    worker.validate_manifest_v2(manifest)
    worker.build_broadcast_ass_v2(manifest, ass)
    run(worker.build_ffmpeg_v2(manifest, camera_a, ass, output))

    first = frame_rgb(output, 2)
    middle = frame_rgb(output, 6)
    last = frame_rgb(output, 10)
    assert first[2] > first[0] + 40, first
    assert middle[0] > middle[2] + 40, middle
    assert last[2] > last[0] + 40, last
    frequency = dominant_frequency(output)
    assert abs(frequency - 880) < 8, frequency
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output
    ], text=True).strip())
    assert abs(duration - 12) < 0.25, duration

print("Video Producer multicam smoke passed: A → B → A with continuous External Audio.")
