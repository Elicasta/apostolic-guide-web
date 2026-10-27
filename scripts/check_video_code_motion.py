#!/usr/bin/env python3
"""Synthetic, credential-free end-to-end proof for the browser scene compositor."""
import json
from pathlib import Path
import subprocess
import tempfile

from video_code_motion_overlay import composite_video_code_scenes


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def frame_hash(path, timestamp):
    output = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", str(timestamp),
        "-i", str(path), "-frames:v", "1", "-f", "md5", "-"
    ])
    return output.strip()


def main():
    with tempfile.TemporaryDirectory(prefix="ag-video-code-smoke-") as folder:
        root = Path(folder)
        original = root / "source.mp4"
        run("ffmpeg","-y","-hide_banner","-loglevel","error",
            "-f","lavfi","-i","testsrc2=size=320x568:rate=30",
            "-f","lavfi","-i","sine=frequency=660:sample_rate=48000",
            "-t","2","-c:v","libx264","-pix_fmt","yuv420p",
            "-c:a","aac",str(original))
        doc = {
            "tool":"video","version":2,"kind":"producer",
            "id":"7b15e253-1776-4a1f-8b23-095e4c5a59bf",
            "format":{"w":320,"h":568,"fps":30},"assets":[],
            "style":{"preset":"apostolic-guide","kineticCaptions":True},
            "scenes":[
                {"id":"scripture","start":0.1,"end":1.3,"layer":"overlay",
                 "html":"<h1 class='headline'>GOD IS ONE</h1><p>Deuteronomy 6:4</p>","css":"",
                 "keyframes":[{"t":0,"target":".headline","props":{"opacity":0,"y":40},"ease":"ease-out"},
                              {"t":0.4,"target":".headline","props":{"opacity":1,"y":0},"ease":"ease-out"}],
                 "transitionIn":{"type":"wipe","duration":0.3,"ease":"ease-out"}},
                {"id":"lowerthird","start":1.3,"end":1.9,"layer":"lowerthird",
                 "html":"<h2>Apostolic Guide</h2>","css":"","keyframes":[]}
            ]}
        manifest={"videoCodeV2":doc,"videoCodeWords":[
            {"word":"HEAR","start":0.15,"end":0.5},
            {"word":"ISRAEL","start":0.5,"end":1.2}],
            "renderPlan":{"output":{"width":320,"height":568,"fps":30},"outputDuration":2}}
        result=composite_video_code_scenes(manifest,str(original),str(root),{},lambda *_args:None)
        if frame_hash(original,0.7)==frame_hash(result,0.7):
            raise AssertionError("Chromium graphics did not change the MP4 frame")
        probe=json.loads(subprocess.check_output([
            "ffprobe","-v","error","-show_streams","-of","json",str(result)
        ]))
        if not any(s.get("codec_type")=="audio" for s in probe.get("streams",[])):
            raise AssertionError("Scene compositor removed the original audio")
        frames=list((root/"scene-frames").glob("*.png"))
        if len(frames)!=60:
            raise AssertionError(f"Expected 60 deterministic 30fps frames; found {len(frames)}")
        print("Video Code v2: 60 Chromium frames composited, visible graphics, audio preserved")


if __name__=="__main__":
    main()
