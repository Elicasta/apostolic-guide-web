#!/usr/bin/env python3
"""Synchronize Camera B / External Audio to Camera A with deterministic waveform correlation."""
import array
import json
import math
import os
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np

SAMPLE_RATE = 8000
ENVELOPE_HZ = 100
BLOCK = SAMPLE_RATE // ENVELOPE_HZ
MIN_OVERLAP_SECONDS = 8.0


def callback(payload, status, progress=None, stage=None, error=None, result=None):
    body = {
        "project_id": payload["project_id"],
        "asset_id": payload["asset_id"],
        "token": payload["callback_token"],
        "status": status,
    }
    if progress is not None:
        body["progress"] = int(progress)
    if stage:
        body["stage"] = stage
    if error:
        body["error"] = str(error)[:3000]
    if result is not None:
        body["result"] = result
    request = urllib.request.Request(
        payload["callback_url"],
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-sync"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"sync callback failed ({response.status})")


def download(url, target):
    request = urllib.request.Request(url, headers={"user-agent": "apostolic-guide-video-producer-sync"})
    with urllib.request.urlopen(request, timeout=240) as response, open(target, "wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def probe(path):
    raw = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
        "-of", "json", path
    ], text=True)
    data = json.loads(raw)
    duration = float((data.get("format") or {}).get("duration") or 0)
    has_audio = any(stream.get("codec_type") == "audio" for stream in data.get("streams") or [])
    if duration <= 0:
        raise RuntimeError("ffprobe returned an invalid media duration")
    return duration, has_audio


def extract_pcm(path, target):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", path,
        "-vn", "-af", "highpass=f=120,lowpass=f=3500,acompressor=threshold=-28dB:ratio=2:attack=10:release=100",
        "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", target
    ], check=True)


def load_envelope(path):
    values = np.fromfile(path, dtype=np.float32)
    if values.size < SAMPLE_RATE * 2:
        raise RuntimeError("not enough audio to synchronize")
    usable = (values.size // BLOCK) * BLOCK
    values = values[:usable].reshape(-1, BLOCK)
    envelope = np.sqrt(np.mean(np.square(values, dtype=np.float64), axis=1))
    envelope = np.log1p(envelope * 20.0)
    envelope -= np.mean(envelope)
    std = float(np.std(envelope))
    if not math.isfinite(std) or std < 1e-5:
        raise RuntimeError("audio waveform is too flat to synchronize")
    return (envelope / std).astype(np.float32)


def next_pow2(value):
    return 1 << max(1, int(value - 1).bit_length())


def overlap_for_lag(a, b, lag):
    if lag >= 0:
        length = min(len(a) - lag, len(b))
        if length <= 0:
            return a[:0], b[:0]
        return a[lag:lag + length], b[:length]
    b_start = -lag
    length = min(len(a), len(b) - b_start)
    if length <= 0:
        return a[:0], b[:0]
    return a[:length], b[b_start:b_start + length]


def coefficient(a, b):
    if len(a) == 0 or len(b) == 0:
        return 0.0
    left = a.astype(np.float64, copy=False)
    right = b.astype(np.float64, copy=False)
    left = left - left.mean()
    right = right - right.mean()
    denom = float(np.linalg.norm(left) * np.linalg.norm(right))
    if denom <= 1e-9:
        return 0.0
    return float(np.dot(left, right) / denom)


def estimate_offset(master, candidate):
    min_overlap = int(MIN_OVERLAP_SECONDS * ENVELOPE_HZ)
    if min(len(master), len(candidate)) < min_overlap:
        raise RuntimeError("media overlap is too short to synchronize reliably")

    # Linear cross-correlation via convolution with reversed candidate.
    n = next_pow2(len(master) + len(candidate) - 1)
    spectrum_a = np.fft.rfft(master, n=n)
    spectrum_b = np.fft.rfft(candidate[::-1], n=n)
    correlation = np.fft.irfft(spectrum_a * spectrum_b, n=n)[:len(master) + len(candidate) - 1]
    lags = np.arange(-(len(candidate) - 1), len(master), dtype=np.int64)

    overlap_lengths = np.minimum(len(master), lags + len(candidate)) - np.maximum(0, lags)
    valid = overlap_lengths >= min_overlap
    if not np.any(valid):
        raise RuntimeError("no sufficiently long waveform overlap was found")

    # Raw correlation naturally rewards meaningful long overlap. Use it only to
    # choose candidates; normalized coefficient below determines confidence.
    scores = np.where(valid, correlation, -np.inf)
    best_indices = np.argpartition(scores, -min(8, np.sum(valid)))[-min(8, np.sum(valid)):]
    candidates = []
    for index in best_indices:
        lag = int(lags[index])
        left, right = overlap_for_lag(master, candidate, lag)
        coeff = coefficient(left, right)
        candidates.append((coeff, lag, len(left)))
    candidates.sort(reverse=True, key=lambda item: item[0])
    best_coeff, best_lag, overlap = candidates[0]

    distant = [item for item in candidates[1:] if abs(item[1] - best_lag) >= int(2 * ENVELOPE_HZ)]
    second_coeff = max((item[0] for item in distant), default=0.0)
    separation = max(0.0, best_coeff - max(0.0, second_coeff))
    overlap_ratio = min(1.0, overlap / max(1, min(len(master), len(candidate))))
    confidence = max(0.0, min(1.0, best_coeff * (0.75 + 0.25 * overlap_ratio) + min(0.15, separation * 0.35)))
    return best_lag / ENVELOPE_HZ, confidence, best_coeff, second_coeff, overlap / ENVELOPE_HZ


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: sync_video_producer_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    for key in ["project_id", "asset_id", "camera_a_url", "asset_url", "callback_url", "callback_token"]:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    callback(payload, "syncing", 2, "Downloading synchronized media")
    with tempfile.TemporaryDirectory(prefix="ag-video-sync-") as directory:
        master_path = os.path.join(directory, "camera-a")
        asset_path = os.path.join(directory, "asset")
        master_pcm = os.path.join(directory, "camera-a.pcm")
        asset_pcm = os.path.join(directory, "asset.pcm")
        download(payload["camera_a_url"], master_path)
        download(payload["asset_url"], asset_path)

        callback(payload, "syncing", 18, "Inspecting media audio")
        master_duration, master_has_audio = probe(master_path)
        asset_duration, asset_has_audio = probe(asset_path)
        if not master_has_audio:
            raise RuntimeError("Camera A has no audio waveform available for synchronization")
        if not asset_has_audio:
            raise RuntimeError("The attached media has no audio waveform available for synchronization")

        callback(payload, "syncing", 30, "Extracting speech-band waveforms")
        extract_pcm(master_path, master_pcm)
        extract_pcm(asset_path, asset_pcm)
        callback(payload, "syncing", 55, "Correlating waveforms")
        master = load_envelope(master_pcm)
        candidate = load_envelope(asset_pcm)
        offset, confidence, peak, second_peak, overlap = estimate_offset(master, candidate)
        status = "synced" if confidence >= 0.30 else "needs_review"
        callback(payload, "completed", 100, "Waveform synchronization ready", result={
            "offset_seconds": round(offset, 4),
            "confidence": round(confidence, 4),
            "status": status,
            "asset_duration": round(asset_duration, 4),
            "has_audio": True,
            "method": "fft_waveform_v1",
            "metadata": {
                "master_duration": round(master_duration, 4),
                "peak_correlation": round(peak, 4),
                "second_peak_correlation": round(second_peak, 4),
                "validated_overlap_seconds": round(overlap, 2),
                "envelope_hz": ENVELOPE_HZ,
            },
        })


if __name__ == "__main__":
    payload = None
    try:
        main()
    except Exception as error:
        try:
            if len(sys.argv) == 2:
                with open(sys.argv[1], "r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            if payload:
                callback(payload, "failed", error=error, stage="Waveform synchronization failed")
        except Exception:
            pass
        raise
