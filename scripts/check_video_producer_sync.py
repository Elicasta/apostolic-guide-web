#!/usr/bin/env python3
import importlib.util
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "scripts", "sync_video_producer_worker.py")
SPEC = importlib.util.spec_from_file_location("sync_worker", PATH)
sync = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(sync)

rng = np.random.default_rng(42)
master = rng.normal(0, 1, 12000).astype(np.float32)
# Give the envelope recognizable long-range structure rather than pure white noise.
x = np.linspace(0, 60, len(master), dtype=np.float32)
master += (np.sin(x * 0.71) * 1.8 + np.sin(x * 0.113) * 0.9).astype(np.float32)

candidate_positive = master[438:].copy() + rng.normal(0, 0.03, len(master) - 438).astype(np.float32)
offset, confidence, *_ = sync.estimate_offset(master, candidate_positive)
assert abs(offset - 4.38) <= 0.02, (offset, confidence)
assert confidence >= 0.75, confidence

prefix = rng.normal(0, 0.2, 214).astype(np.float32)
candidate_negative = np.concatenate([prefix, master])
offset, confidence, *_ = sync.estimate_offset(master, candidate_negative)
assert abs(offset - (-2.14)) <= 0.02, (offset, confidence)
assert confidence >= 0.70, confidence

candidate_near = master[1:].copy()
offset, confidence, *_ = sync.estimate_offset(master, candidate_near)
assert abs(offset - 0.01) <= 0.02, (offset, confidence)

print("Video Producer waveform sync smoke passed: positive, negative, and near-zero offsets.")
