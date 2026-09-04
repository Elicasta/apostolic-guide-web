#!/usr/bin/env python3
import importlib.util
import os
import subprocess
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "scripts", "render_video_producer_visual_pass_worker.py")
SPEC = importlib.util.spec_from_file_location("visual_pass_worker", PATH)
worker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(worker)


def run(command):
    subprocess.run(command, check=True)


def make_video(path, color, frequency, duration=6):
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
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "1", "-t", "4", "-i", path,
        "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1"
    ])
    samples = np.frombuffer(raw, dtype=np.float32)
    windowed = samples * np.hanning(len(samples))
    spectrum = np.abs(np.fft.rfft(windowed))
    frequencies = np.fft.rfftfreq(len(samples), d=1 / 8000)
    return float(frequencies[int(np.argmax(spectrum))])


def manifest(visual_path):
    return {
        "version": 3,
        "project": {"id": "visual-smoke", "title": "Visual Pass Smoke", "mode": "podcast", "pathway": None},
        "source": {"filename": "a-roll.mp4", "duration": 6, "range": None},
        "renderPlan": {
            "version": 2,
            "mode": "podcast",
            "sourceDuration": 6,
            "outputDuration": 6,
            "keepSegments": [{"start": 0, "end": 6}],
            "overlays": [],
            "motion": [],
            "music": [],
            "captions": {"enabled": False, "style": "minimal", "animation": "none", "maxWordsPerCard": 8, "position": "lower", "highlightCurrentWord": False},
            "audioPreset": "none",
            "colorPreset": "none",
            "intro": False,
            "outro": False,
            "output": {"format": "mp4", "width": 1920, "height": 1080, "fps": 30}
        },
        "transcript": {"text": "", "duration": 6, "words": [], "segments": []},
        "musicTracks": [],
        "visuals": {
            "version": 1,
            "authority": "assembly",
            "audioPolicy": "a-roll-continues",
            "placements": [{
                "placement": {
                    "id": "placement-1",
                    "projectId": "visual-smoke",
                    "beatId": "beat-1",
                    "assetId": "visual-1",
                    "sourceStart": 2,
                    "sourceEnd": 4,
                    "assetIn": 0,
                    "assetOut": 2,
                    "fit": "cover",
                    "positionX": 0.5,
                    "positionY": 0.5,
                    "scale": 1,
                    "layer": 2,
                    "audioEnabled": False,
                    "source": "auto",
                    "locked": False,
                    "revision": 1,
                    "outputRanges": [{"sourceStart": 2, "sourceEnd": 4, "outputStart": 2, "outputEnd": 4}]
                },
                "asset": {
                    "id": "visual-1",
                    "provider": "ag-library",
                    "providerAssetId": "visual-1",
                    "filename": "visual.mp4",
                    "localPath": visual_path,
                    "duration": 6,
                    "width": 1280,
                    "height": 720,
                    "fps": 30,
                    "revision": 1,
                    "sha256": "smoke"
                }
            }],
            "licenseManifest": []
        },
        "brand": {}
    }


def main():
    os.chdir(ROOT)
    with tempfile.TemporaryDirectory(prefix="ag-visual-pass-smoke-") as directory:
        source = os.path.join(directory, "a-roll.mp4")
        visual = os.path.join(directory, "visual.mp4")
        ass = os.path.join(directory, "graphics.ass")
        output = os.path.join(directory, "output.mp4")
        make_video(source, "blue", 440)
        make_video(visual, "green", 990)

        data = manifest(visual)
        worker.validate_manifest_v3(data)
        worker.fw.build_broadcast_ass_v2(data, ass)
        command = worker.build_ffmpeg_v3(data, source, ass, output)
        command_text = " ".join(command)
        if "overlay=" not in command_text or "enable='between(t,2.0000,4.0000)'" not in command_text:
            raise RuntimeError("V3 command is missing explicit Visual Pass timing")
        if command_text.rfind("ass=") < command_text.rfind("overlay="):
            raise RuntimeError("Graphics V2 must be composited after Visual Pass media")
        if "[1:a]" in command_text:
            raise RuntimeError("Visual Pass audio must never enter the production mix")

        transformed = manifest(visual)
        transformed_placement = transformed["visuals"]["placements"][0]["placement"]
        transformed_placement["scale"] = 0.5
        transformed_placement["positionX"] = 0.2
        transformed_placement["positionY"] = 0.8
        transformed_command = " ".join(worker.build_ffmpeg_v3(transformed, source, ass, output))
        if "iw*0.500000" not in transformed_command or "(W-w)*0.200000" not in transformed_command or "(H-h)*0.800000" not in transformed_command:
            raise RuntimeError("Visual Pass transform controls are not reaching FFmpeg")

        run(command)
        before = frame_rgb(output, 1)
        during = frame_rgb(output, 3)
        after = frame_rgb(output, 5)
        if not (before[2] > before[0] + 40 and after[2] > after[0] + 40):
            raise RuntimeError(f"A-roll did not remain visible outside the Visual Pass range: {before} / {after}")
        if not (during[1] > during[0] + 35 and during[1] > during[2] + 20):
            raise RuntimeError(f"Visual Pass media was not visible during its range: {during}")

        frequency = dominant_frequency(output)
        if abs(frequency - 440) >= 8:
            raise RuntimeError(f"Visual Pass changed the A-roll audio master: {frequency:.2f} Hz")
        duration = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", output
        ], text=True).strip())
        if abs(duration - 6) >= 0.25:
            raise RuntimeError(f"Visual Pass changed output duration: {duration:.3f}")

    print("Video Producer Visual Pass V3 smoke passed: timed B-roll, Graphics V2 on top, A-roll audio preserved.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"::error title=Video Producer Visual Pass smoke::{type(error).__name__}: {error}", flush=True)
        raise
