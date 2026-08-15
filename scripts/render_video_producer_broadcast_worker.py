#!/usr/bin/env python3
"""Production Video Producer worker with AG broadcast graphics and live render progress."""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_WORKER_PATH = os.path.join(ROOT, "scripts", "render_video_producer_worker.py")
SPEC = importlib.util.spec_from_file_location("video_producer_base_worker", BASE_WORKER_PATH)
base = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(base)

from video_producer_broadcast_graphics import build_broadcast_ass  # noqa: E402

# Keep the proven trim/audio/color/upload contract intact. The production wrapper owns
# broadcast graphics, progress reporting, and the packaging optimization.
base.build_ass = build_broadcast_ass

# Public smoke-test hooks mirror the base worker interface.
validate_manifest = base.validate_manifest
build_ass = build_broadcast_ass
build_ffmpeg = base.build_ffmpeg


def format_eta(seconds):
    if seconds is None or seconds < 0 or seconds > 24 * 60 * 60:
        return "estimating"
    value = int(round(seconds))
    if value < 60:
        return f"{value}s"
    minutes, secs = divmod(value, 60)
    if minutes < 60:
        return f"{minutes}m {secs:02d}s"
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes:02d}m"


def safe_progress_callback(payload, percent, stage):
    """Progress heartbeats are best-effort; a transient callback error must not kill FFmpeg."""
    try:
        base.callback(payload, "rendering", int(percent), stage)
    except Exception as error:
        print(f"progress callback failed: {error}", file=sys.stderr, flush=True)


def optimized_render_command(manifest, source, ass_file, output_file):
    command = base.build_ffmpeg(manifest, source, ass_file, output_file)
    mode = (manifest.get("renderPlan") or {}).get("mode")

    # The hosted worker is CPU-bound. Reels need extremely fast turnaround because the
    # source is already a tightly selected short-form range. Keep CRF as quality control,
    # use ultrafast for Reels and superfast for long-form. This trades encode efficiency
    # and file size rather than silently lowering the requested visual-quality target.
    requested_preset = "ultrafast" if mode == "reels" else "superfast"
    for index, value in enumerate(command[:-1]):
        if value == "-preset" and index + 1 < len(command) - 1:
            command[index + 1] = requested_preset

    # FFmpeg's progress protocol gives machine-readable output timestamps without noisy
    # frame logs. Keep the final output path last.
    return command[:-1] + ["-progress", "pipe:1", "-nostats", command[-1]]


def run_main_render_with_progress(payload, manifest, source, ass_file, output_file):
    plan = manifest["renderPlan"]
    output_duration = max(0.01, float(plan.get("outputDuration") or 0))
    command = optimized_render_command(manifest, source, ass_file, output_file)
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
        bufsize=1,
    )
    if process.stdout is None:
        raise RuntimeError("FFmpeg progress stream is unavailable")

    started = time.monotonic()
    last_callback_at = 0.0
    last_percent = 18
    processed_seconds = 0.0

    def report(force=False):
        nonlocal last_callback_at, last_percent
        now = time.monotonic()
        fraction = max(0.0, min(1.0, processed_seconds / output_duration))
        percent = max(18, min(88, int(round(18 + fraction * 70))))
        elapsed = max(0.001, now - started)
        speed = processed_seconds / elapsed if processed_seconds > 0 else 0.0
        eta = (output_duration - processed_seconds) / speed if speed > 0.02 else None
        if force or now - last_callback_at >= 10 or percent >= last_percent + 2:
            stage = f"Encoding master · ETA {format_eta(eta)} · {speed:.2f}x"
            print(
                f"Video Producer render: {percent}% | media {processed_seconds:.1f}/{output_duration:.1f}s | "
                f"speed {speed:.2f}x | ETA {format_eta(eta)}",
                flush=True,
            )
            safe_progress_callback(payload, percent, stage)
            last_callback_at = now
            last_percent = percent

    report(force=True)
    for raw_line in process.stdout:
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key == "out_time_us":
            try:
                processed_seconds = max(processed_seconds, float(value) / 1_000_000.0)
            except ValueError:
                pass
            report()
        elif key == "progress" and value == "end":
            processed_seconds = output_duration
            report(force=True)

    return_code = process.wait()
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)


def _concat_path(path):
    return path.replace("'", "'\\''")


def media_duration(path):
    result = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path
    ], check=True, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except ValueError as error:
        raise RuntimeError("Final MP4 duration could not be verified") from error


def validate_packaged_duration(manifest, final_file):
    plan = manifest["renderPlan"]
    expected = float(plan.get("outputDuration") or 0)
    if plan.get("intro"):
        expected += 1.8
    if plan.get("outro"):
        expected += 1.6
    actual = media_duration(final_file)
    tolerance = max(2.5, expected * 0.025)
    if expected <= 0 or actual <= 0 or abs(actual - expected) > tolerance:
        raise RuntimeError(f"Packaged MP4 duration is invalid: expected about {expected:.2f}s, got {actual:.2f}s")
    print(f"Video Producer package verified: {actual:.2f}s (expected {expected:.2f}s)", flush=True)
    return actual


def package_with_bumpers(manifest, main_file, final_file, directory):
    """Build bumpers while preserving video frames and normalizing audio/container timestamps."""
    plan = manifest["renderPlan"]
    parts = []
    if plan.get("intro"):
        intro_file = os.path.join(directory, "intro.mp4")
        base.make_bumper(manifest, intro_file, 1.8, outro=False)
        parts.append(intro_file)
    parts.append(main_file)
    if plan.get("outro"):
        outro_file = os.path.join(directory, "outro.mp4")
        base.make_bumper(manifest, outro_file, 1.6, outro=True)
        parts.append(outro_file)

    if len(parts) == 1:
        # A timestamp-normalizing remux keeps Safari/iOS metadata trustworthy even when
        # the source encoder emitted an unusual starting timestamp.
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
            "-fflags", "+genpts", "-i", main_file,
            "-map", "0:v:0", "-map", "0:a:0",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-af", "aresample=async=1:first_pts=0",
            "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", final_file
        ], check=True)
        validate_packaged_duration(manifest, final_file)
        return

    concat_file = os.path.join(directory, "package-concat.txt")
    with open(concat_file, "w", encoding="utf-8") as handle:
        for part in parts:
            handle.write(f"file '{_concat_path(os.path.abspath(part))}'\n")

    # Copy the expensive H.264 video stream, but rebuild AAC audio timestamps. The old
    # all-stream copy produced non-monotonic DTS warnings and could make Safari report a
    # one-second duration even though the full master existed.
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-fflags", "+genpts", "-f", "concat", "-safe", "0", "-i", concat_file,
        "-map", "0:v:0", "-map", "0:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-af", "aresample=async=1:first_pts=0",
        "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", final_file
    ], check=True)
    validate_packaged_duration(manifest, final_file)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: render_video_producer_broadcast_worker.py payload.json output.mp4")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["job_id", "project_id", "source_url", "manifest_url", "output_upload_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    base.callback(payload, "rendering", 2, "Downloading render manifest")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-render-") as directory:
        manifest_path = os.path.join(directory, "manifest.json")
        source_path = os.path.join(directory, "source-video")
        ass_path = os.path.join(directory, "graphics.ass")
        main_path = os.path.join(directory, "main.mp4")

        base.download(payload["manifest_url"], manifest_path)
        with open(manifest_path, "r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        base.validate_manifest(manifest)

        base.callback(payload, "rendering", 6, "Downloading source video")
        base.download(payload["source_url"], source_path)
        base.callback(payload, "rendering", 12, "Building captions and graphics")
        build_broadcast_ass(manifest, ass_path)

        safe_progress_callback(payload, 18, "Encoding master · estimating")
        run_main_render_with_progress(payload, manifest, source_path, ass_path, main_path)
        if not os.path.exists(main_path) or os.path.getsize(main_path) < 1024:
            raise RuntimeError("FFmpeg completed without a usable main render")

        base.callback(payload, "rendering", 89, "Building timestamp-safe package")
        package_with_bumpers(manifest, main_path, sys.argv[2], directory)
        if not os.path.exists(sys.argv[2]) or os.path.getsize(sys.argv[2]) < 1024:
            raise RuntimeError("Video Producer package did not create a usable output file")

        base.callback(payload, "rendering", 94, "Uploading finished master")
        base.upload_file(payload["output_upload_url"], sys.argv[2])
        base.callback(payload, "completed", 100, "Ready to review")


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
                base.callback(payload, "failed", 100, "Render failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr, flush=True)
        raise
