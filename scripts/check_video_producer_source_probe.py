#!/usr/bin/env python3
"""Color metadata smoke: SDR, HLG and PQ files must not be misclassified."""
import os
import subprocess
import tempfile
from video_producer_source_probe import source_probe


def source(path, transfer, primaries, matrix):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=1",
        "-vf", f"setparams=color_primaries={primaries}:color_trc={transfer}:colorspace={matrix}",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path
    ], check=True)


def main():
    with tempfile.TemporaryDirectory(prefix="ag-source-probe-") as directory:
        for expected, transfer, primaries, matrix in [
            ("sdr", "bt709", "bt709", "bt709"),
            ("hlg", "arib-std-b67", "bt2020", "bt2020nc"),
            ("pq", "smpte2084", "bt2020", "bt2020nc")
        ]:
            path = os.path.join(directory, expected + ".mp4")
            source(path, transfer, primaries, matrix)
            probe = source_probe(path)
            assert probe["hdrMode"] == expected, probe
            assert probe["colorTransfer"] == transfer, probe
            assert probe["width"] == 160 and probe["height"] == 90, probe
            assert probe["averageFps"] == 30, probe
            assert probe["bitDepth"] == 8, probe
            assert probe["vfrHint"] == "undetermined", probe
    print("SDR/HLG/PQ source metadata probe smoke passed")


if __name__ == "__main__":
    main()
