#!/usr/bin/env python3
"""Measured, two-pass EBU R128 loudness finishing for Video Producer.

Runs on the packaged MP4 *after* speech/music mixing and optional bumpers. The
video bitstream is copied without re-encoding. Does not modify edit/cut plans.
"""
import json
import math
import os
import re
import subprocess


def target_for_plan(plan):
    preset = plan.get("audioPreset") or "none"
    if preset == "ag-voice-clean":
        return {"integrated": -16, "truePeak": -1, "lra": 7}
    if preset == "ag-voice-punch":
        return {"integrated": -14, "truePeak": -1, "lra": 6}
    return None


def _run(command):
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError("FFmpeg audio mastering failed: " + result.stderr[-1600:])
    return result


def measure_loudness(path, target):
    """Collect integrated loudness, LRA and true peak from FFmpeg's JSON report."""
    filter_arg = "loudnorm=I={integrated}:TP={truePeak}:LRA={lra}:print_format=json".format(**target)
    output = _run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "info",
                   "-i", path, "-map", "0:a:0", "-vn", "-af", filter_arg,
                   "-f", "null", "-"])
    matches = list(re.finditer(r'\{\s*"input_i"\s*:.*?\}', output.stderr, re.S))
    if not matches:
        raise RuntimeError("Could not parse FFmpeg EBU R128 loudness measurement")
    values = json.loads(matches[-1].group())
    fields = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    try:
        values = {field: float(values[field]) for field in fields}
    except (KeyError, ValueError, TypeError) as error:
        raise RuntimeError("FFmpeg loudness measurements incomplete") from error
    if not all(math.isfinite(value) for value in values.values()):
        raise RuntimeError("Audio has silence or non-finite loudness measurements")
    return values


def master_packaged_audio(source, output, plan, tolerance=1.0):
    """Master to plan's LUFS *after* mixing; return before/after measurements."""
    target = target_for_plan(plan)
    if not target:
        raise ValueError("No loudness target for an audioPreset=none render")
    if os.path.abspath(source) == os.path.abspath(output):
        raise ValueError("Audio mastering requires a distinct output file")
    if not 0 < tolerance <= 1.5:
        raise ValueError("Invalid loudness tolerance")
    before = measure_loudness(source, target)
    options = (
        "loudnorm=I={integrated}:TP={truePeak}:LRA={lra}:"
        "measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:"
        "measured_thresh={input_thresh}:offset={target_offset}:linear=true:print_format=summary"
    ).format(**target, **before)
    _run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
          "-i", source, "-map", "0:v:0", "-map", "0:a:0", "-map_metadata", "0",
          "-c:v", "copy", "-af", options, "-ar", "48000", "-ac", "2",
          "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output])
    if not os.path.exists(output) or os.path.getsize(output) < 1024:
        raise RuntimeError("Two-pass mastering generated no usable MP4")
    after = measure_loudness(output, target)
    if abs(after["input_i"] - target["integrated"]) > tolerance:
        raise RuntimeError("Final loudness outside tolerance: measured "
                           f"{after['input_i']:.2f} LUFS, target {target['integrated']} LUFS")
    if after["input_tp"] > target["truePeak"] + .25:
        raise RuntimeError("Final true peak exceeds the target: "
                           f"{after['input_tp']:.2f} dBTP")
    report = {"target": target, "before": before, "after": after, "toleranceLu": tolerance}
    print("Video Producer post-mix audio QC: " + json.dumps(report, sort_keys=True), flush=True)
    return report
