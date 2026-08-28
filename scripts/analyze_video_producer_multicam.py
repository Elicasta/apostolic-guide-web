#!/usr/bin/env python3
"""Waveform synchronization worker for Video Producer multicam sources."""
import json
import math
import subprocess
import sys
import urllib.request

import numpy as np

SAMPLE_RATE = 2000
ENVELOPE_HZ = 4
MAX_OFFSET_SECONDS = 120
MAX_WAVEFORM_POINTS = 240


def callback(payload, status, **values):
    body = {"job_id": payload["job_id"], "project_id": payload["project_id"], "token": payload["callback_token"], "status": status, **values}
    request = urllib.request.Request(payload["callback_url"], data=json.dumps(body).encode("utf-8"), method="POST", headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-multicam"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback failed ({response.status})")


def duration(url):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", url], check=True, capture_output=True, text=True)
    return max(0.0, float(result.stdout.strip()))


def envelope(url):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", url, "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"], check=True, capture_output=True)
    samples = np.frombuffer(result.stdout, dtype=np.float32)
    window = max(1, SAMPLE_RATE // ENVELOPE_HZ)
    usable = (samples.size // window) * window
    if usable < window * 8:
        raise RuntimeError("Source audio is too short for waveform sync")
    chunks = samples[:usable].reshape(-1, window)
    env = np.sqrt(np.mean(np.square(chunks, dtype=np.float64), axis=1))
    floor = float(np.percentile(env, 20))
    ceiling = float(np.percentile(env, 95))
    span = max(1e-9, ceiling - floor)
    env = np.clip((env - floor) / span, 0, 3)
    env = env - np.mean(env)
    std = float(np.std(env))
    if std < 0.015:
        raise RuntimeError("Source audio is too quiet or constant for waveform sync")
    return (env / std).astype(np.float32)


def sync(primary, secondary):
    limit = MAX_OFFSET_SECONDS * ENVELOPE_HZ
    min_overlap = max(24, ENVELOPE_HZ * 8)
    best_lag = 0
    best_score = -2.0
    for lag in range(-limit, limit + 1):
        if lag >= 0:
            a = primary[lag:]
            b = secondary[: len(a)]
        else:
            b = secondary[-lag:]
            a = primary[: len(b)]
        count = min(len(a), len(b))
        if count < min_overlap:
            continue
        a = a[:count]
        b = b[:count]
        denom = math.sqrt(float(np.dot(a, a)) * float(np.dot(b, b)))
        if denom <= 1e-9:
            continue
        score = float(np.dot(a, b)) / denom
        if score > best_score:
            best_score = score
            best_lag = lag
    if best_score <= -1.5:
        raise RuntimeError("No usable waveform overlap was found")
    # Positive offset means secondary media time 0 occurs later on Camera A's timeline.
    return best_lag * 1000.0 / ENVELOPE_HZ, max(0.0, min(1.0, (best_score + 0.05) / 0.85))


def waveform_points(env):
    values = np.abs(env)
    if values.size <= MAX_WAVEFORM_POINTS:
        buckets = values
    else:
        edges = np.linspace(0, values.size, MAX_WAVEFORM_POINTS + 1, dtype=int)
        buckets = np.array([np.mean(values[edges[i]:edges[i + 1]]) for i in range(MAX_WAVEFORM_POINTS)])
    high = max(1e-9, float(np.percentile(buckets, 95)))
    return [int(round(max(0.0, min(100.0, float(value) / high * 100.0)))) for value in buckets]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: analyze_video_producer_multicam.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    for key in ("job_id", "project_id", "primary_url", "callback_url", "callback_token"):
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")
    callback(payload, "analyzing")
    primary = envelope(payload["primary_url"])
    waveforms = {"camera-a": waveform_points(primary)}
    offsets = {}
    confidence = {}
    camera_durations = {}
    for camera in payload.get("cameras") or []:
        camera_id = str(camera.get("id") or "").strip()
        url = camera.get("url")
        if not camera_id or not url:
            continue
        secondary = envelope(url)
        offset_ms, score = sync(primary, secondary)
        offsets[camera_id] = round(offset_ms, 3)
        confidence[camera_id] = round(score, 4)
        camera_durations[camera_id] = duration(url)
        waveforms[camera_id] = waveform_points(secondary)

    external_url = payload.get("external_audio_url")
    external_offset = None
    external_confidence = None
    external_duration = None
    if external_url:
        external = envelope(external_url)
        external_offset, external_confidence = sync(primary, external)
        external_duration = duration(external_url)
        waveforms["external-audio"] = waveform_points(external)

    callback(payload, "completed",
        camera_offsets_ms=offsets,
        camera_confidence=confidence,
        camera_durations=camera_durations,
        external_audio_offset_ms=round(external_offset, 3) if external_offset is not None else None,
        external_audio_confidence=round(external_confidence, 4) if external_confidence is not None else None,
        external_audio_duration=external_duration,
        primary_duration=duration(payload["primary_url"]),
        waveforms=waveforms)


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) >= 2:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload and payload.get("callback_url") and payload.get("callback_token"):
            try:
                callback(payload, "failed", error=str(error)[:3000])
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr)
        raise
