#!/usr/bin/env python3
"""Bounded FFprobe video-color metadata; observational only, no tonemapping."""
import json
import math
import re
import subprocess
from fractions import Fraction


def _rate(value):
    try:
        rate = float(Fraction(str(value)))
        return round(rate, 4) if math.isfinite(rate) and rate > 0 else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _depth(stream):
    raw = stream.get("bits_per_raw_sample")
    if raw is not None and str(raw).isdigit():
        bits = int(raw)
        if 1 <= bits <= 32:
            return bits
    pix = stream.get("pix_fmt") or ""
    match = re.search(r"p(9|10|12|14|16)(?:le|be)?$", pix)
    if match:
        return int(match.group(1))
    if pix in ("yuv420p", "yuv422p", "yuv444p", "nv12", "rgb24"):
        return 8
    return None


def source_probe(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_streams", "-show_format", "-of", "json", path],
        check=True, capture_output=True, text=True, timeout=60,
    )
    data = json.loads(result.stdout)
    streams = data.get("streams") or []
    if not streams:
        raise RuntimeError("Source video has no video stream")
    stream = streams[0]
    transfer = str(stream.get("color_transfer") or "unknown").lower()
    hdr_mode = ("hlg" if transfer == "arib-std-b67" else
                "pq" if transfer == "smpte2084" else
                "sdr" if transfer in ("bt709", "iec61966-2-1", "smpte170m", "bt470bg", "bt470m", "smpte240m") else
                "unknown")
    rotation = stream.get("tags", {}).get("rotate", 0)
    for item in stream.get("side_data_list") or []:
        if "rotation" in item:
            rotation = item["rotation"]
            break
    try:
        rotation = int(round(float(rotation)))
    except (ValueError, TypeError):
        rotation = 0
    avg_fps = _rate(stream.get("avg_frame_rate"))
    nominal = _rate(stream.get("r_frame_rate"))
    variation = (abs(avg_fps - nominal) / nominal if avg_fps and nominal else None)
    # This comparison is a *hint*, not proof that frame presentation timestamps vary.
    vfr_hint = "likely" if variation is not None and variation > .02 else "undetermined"
    duration = data.get("format", {}).get("duration")
    try:
        duration = float(duration)
    except (ValueError, TypeError):
        duration = 0
    return {
        "durationSec": round(duration, 4) if math.isfinite(duration) and duration > 0 else None,
        "width": stream.get("width"), "height": stream.get("height"),
        "colorPrimaries": stream.get("color_primaries") or "unknown",
        "colorTransfer": transfer,
        "colorSpace": stream.get("color_space") or "unknown",
        "colorRange": stream.get("color_range") or "unknown",
        "pixelFormat": stream.get("pix_fmt") or "unknown",
        "bitDepth": _depth(stream), "rotationDegrees": rotation,
        "averageFps": avg_fps, "nominalFps": nominal,
        "vfrHint": vfr_hint, "hdrMode": hdr_mode
    }
