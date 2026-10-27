#!/usr/bin/env python3
"""Synthetic regression for music attenuation and final two-pass master."""
import os
import subprocess
import tempfile
from video_producer_audio_master import master_packaged_audio, measure_loudness, target_for_plan


def run(args):
    subprocess.run(args, check=True)


def make_source(path, include_music):
    inputs = ["-f", "lavfi", "-i", "color=c=black:s=320x180:r=30:d=6",
              "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=6"]
    if include_music:
        inputs += ["-f", "lavfi", "-i", "sine=frequency=110:sample_rate=48000:duration=6"]
        audio_filter = ("[1:a]volume=0.08,aresample=48000[voice];"
                        "[2:a]volume=0.01,aresample=48000[bed];"
                        "[voice][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]")
    else:
        audio_filter = "[1:a]volume=0.08,aresample=48000[aout]"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *inputs,
         "-filter_complex", audio_filter, "-map", "0:v:0", "-map", "[aout]",
         "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", path])


def video_digest(path):
    return subprocess.check_output(["ffmpeg", "-hide_banner", "-loglevel", "error",
                                    "-i", path, "-map", "0:v:0", "-c:v", "copy",
                                    "-f", "md5", "-"])


def main():
    assert target_for_plan({"audioPreset": "none"}) is None
    with tempfile.TemporaryDirectory(prefix="ag-audio-master-") as directory:
        voice = os.path.join(directory, "voice.mp4")
        mix = os.path.join(directory, "mix.mp4")
        make_source(voice, include_music=False)
        make_source(mix, include_music=True)
        target = target_for_plan({"audioPreset": "ag-voice-clean"})
        before_voice = measure_loudness(voice, target)
        before_mix = measure_loudness(mix, target)
        assert before_mix["input_i"] >= before_voice["input_i"] - 1, (before_voice, before_mix)
        for preset, expected in (("ag-voice-clean", -16), ("ag-voice-punch", -14)):
            output = os.path.join(directory, preset + ".mp4")
            report = master_packaged_audio(mix, output, {"audioPreset": preset}, tolerance=.5)
            assert abs(report["after"]["input_i"] - expected) <= .5, report
            assert report["after"]["input_tp"] <= -.75, report
            assert video_digest(mix) == video_digest(output), "Video was reencoded by mastering"
            assert os.stat(output).st_size > 1024
        print("Video Producer post-mix mastering regression passed")


if __name__ == "__main__":
    main()
