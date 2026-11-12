#!/usr/bin/env python3
"""Draft-only ten-second Chromium preview. No approval or YouTube endpoints."""
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def callback(payload,status,error=None):
 body=json.dumps({"jobId":payload["job_id"],"token":payload["callback_token"],
                  "status":status,"error":error}).encode("utf-8")
 request=urllib.request.Request(payload["callback_url"],data=body,method="POST",
   headers={"content-type":"application/json","user-agent":"video-producer-agent-proof"})
 with urllib.request.urlopen(request,timeout=90) as response:
  if response.status >= 300:
   raise RuntimeError("Preview callback returned a non-success status")


def run_safe(argv):
 proc=subprocess.run(argv,cwd=ROOT,capture_output=True,text=True,timeout=45*60)
 if proc.returncode:
  # Never echo signed media URLs or bearer tokens from ffmpeg command output.
  raise RuntimeError(f"Draft preview subprocess {argv[0]} failed with exit code {proc.returncode}")
 return proc.stdout


def read_document(url,target):
 with urllib.request.urlopen(url,timeout=90) as response:
  document=response.read(5*1024*1024+1)
 if not document or len(document)>5*1024*1024:
  raise RuntimeError("Preview scene document exceeds 5MB")
 parsed=json.loads(document)
 if parsed.get("kind")!="producer" or parsed.get("tool")!="video" or parsed.get("version")!=2:
  raise RuntimeError("Preview only accepts a saved Video Code Mode producer scene")
 with open(target,"wb") as handle:
  handle.write(document)
 return parsed


def main(payload):
 seconds=float(payload["duration"])
 if not (0<seconds<=10):
  raise RuntimeError("Draft preview must be between 0 and 10 seconds")
 offset=float(payload["source_offset"])
 if offset<0 or offset>24*60*60:
  raise RuntimeError("Invalid source offset")
 with tempfile.TemporaryDirectory(prefix="video-draft-proof-") as directory:
  document_path=os.path.join(directory,"scene.json")
  base_path=os.path.join(directory,"base.mp4")
  output_path=os.path.join(directory,"preview.mp4")
  document=read_document(payload["document_url"],document_path)
  fmt=document["format"]
  width,height=int(fmt["w"]),int(fmt["h"])
  if (width,height) not in ((1080,1920),(1920,1080)):
   raise RuntimeError("Only supported portrait or landscape frame sizes can be previewed")
  callback(payload,"rendering")
  vf=(f"fps=30,scale={width}:{height}:force_original_aspect_ratio=decrease,"
      f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1")
  run_safe(["ffmpeg","-hide_banner","-loglevel","error","-y",
            "-ss",str(offset),"-i",payload["source_url"],"-t",str(seconds),
            "-vf",vf,"-c:v","libx264","-preset","ultrafast",
            "-c:a","aac","-b:a","128k","-pix_fmt","yuv420p",
            "-movflags","+faststart",base_path])
  run_safe(["node","--import","tsx","scripts/render-video-code-mode.ts",
            document_path,base_path,output_path,"0",str(seconds)])
  command=subprocess.run(["curl","--fail","--silent","--show-error","-X","PUT",
    "-H","content-type: video/mp4","--upload-file",output_path,
    payload["output_upload_url"]],capture_output=True,text=True,timeout=3600)
  if command.returncode:
   raise RuntimeError("Private preview upload failed. Check the Vercel Blob upload token expiration.")
  callback(payload,"completed")


if __name__=="__main__":
 payload=None
 try:
  if len(sys.argv)!=2:raise RuntimeError("usage: draft_preview_worker.py payload.json")
  with open(sys.argv[1],encoding="utf-8") as handle:payload=json.load(handle)
  main(payload)
 except Exception as exc:
  print("Draft preview error:",str(exc),file=sys.stderr,flush=True)
  if payload:
   try:callback(payload,"failed",str(exc))
   except Exception:print("Draft proof failure callback unavailable",file=sys.stderr)
  raise
