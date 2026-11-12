#!/usr/bin/env python3
"""Human-triggered, streaming YouTube release worker for existing Video Producer.

A GitHub Actions worker gets only short-lived source URLs and a hashed callback
token. It requests OAuth access from the authenticated server-side token broker.
The upload uses YouTube resumable chunks and stores the YouTube video ID before
attempting thumbnail or playlist updates. No scheduled cron or AI starts this.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

CHUNK_SIZE = 8 * 1024 * 1024
TOKEN_TTL_SECONDS = 2500
MAX_TRIES = 4
TOKEN = None
TOKEN_VALID_UNTIL = 0


def request_json(url, payload, headers=None, timeout=120):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "User-Agent": "video-producer-youtube-worker",
        **(headers or {})
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)


def broker(payload, force=False):
    global TOKEN, TOKEN_VALID_UNTIL
    if not force and TOKEN and time.monotonic() < TOKEN_VALID_UNTIL:
        return TOKEN
    response = request_json(payload["token_url"], {"token":payload["callback_token"]})
    token = response.get("accessToken")
    if not token or response.get("channelHandle") != payload["channel_handle"]:
        raise RuntimeError("Broker denied the selected YouTube channel; no upload was started")
    TOKEN = token
    TOKEN_VALID_UNTIL = time.monotonic() + TOKEN_TTL_SECONDS
    return TOKEN


def callback(payload, status, progress=None, stage=None, video_id=None, error=None, warnings=None):
    body = {"token":payload["callback_token"], "status":status}
    if progress is not None: body["progress"] = int(progress)
    if stage: body["stage"] = str(stage)[:180]
    if video_id: body["videoId"] = video_id
    if error: body["error"] = str(error)[:1800]
    if warnings: body["warnings"] = [str(w)[:800] for w in warnings][:8]
    for attempt in range(4):
        try:
            return request_json(payload["callback_url"], body, timeout=90)
        except (urllib.error.URLError, OSError, ValueError) as failure:
            if attempt == 3:
                raise RuntimeError("Worker callback failed; check this YouTube ID in Studio before retrying") from failure
            time.sleep(min(2 ** attempt, 8))


def source_length(url):
    req = urllib.request.Request(url, headers={"Range":"bytes=0-0","User-Agent":"video-producer-youtube-worker"})
    with urllib.request.urlopen(req, timeout=180) as response:
        content_range = response.headers.get("Content-Range","")
        match = re.match(r"bytes 0-0/(\d+)$",content_range)
        if match:
            size = int(match.group(1))
        elif response.status == 200:
            size = int(response.headers.get("Content-Length","0"))
        else:
            raise RuntimeError("Blob source does not provide a trustworthy media size")
        if size <= 0 or size > 25 * 1024 * 1024 * 1024:
            raise RuntimeError("Invalid source size for YouTube worker")
        return size


def read_source_chunk(url, start, length, total):
    end = start + length - 1
    req = urllib.request.Request(url, headers={
        "Range":f"bytes={start}-{end}", "User-Agent":"video-producer-youtube-worker"
    })
    with urllib.request.urlopen(req,timeout=300) as response:
        if response.status != 206 and (start > 0 or total > length):
            raise RuntimeError("Private Blob source does not support byte ranges, so the upload cannot safely resume")
        data = response.read(length + 1)
        if len(data) != length:
            raise RuntimeError("Source media range returned an incomplete or oversized chunk")
        if response.status == 206:
            actual = response.headers.get("Content-Range","")
            if not actual.startswith(f"bytes {start}-{end}/"):
                raise RuntimeError("Unexpected private Blob Content-Range; upload stopped")
        return data


def upload_session(payload, total):
    token = broker(payload)
    body = json.dumps({
        "snippet":{"title":payload["title"][:100], "description":payload.get("description","")[:5000],
                   "categoryId":"22"},
        "status":{"privacyStatus":"private","publishAt":payload["publish_at"],
                  "selfDeclaredMadeForKids":False}
    }).encode("utf-8")
    url = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status"
    req = urllib.request.Request(url,data=body,method="POST",headers={
        "Authorization":"Bearer "+token,"Content-Type":"application/json; charset=UTF-8",
        "X-Upload-Content-Length":str(total),"X-Upload-Content-Type":"video/mp4"
    })
    with urllib.request.urlopen(req,timeout=120) as response:
        location = response.headers.get("Location","")
        if not location.startswith("https://www.googleapis.com/"):
            raise RuntimeError("YouTube did not return a trustworthy resumable upload location")
        return location


def parse_resumable_ack(raw,expected):
    match=re.match(r"^bytes=0-(\d+)$",raw or "")
    if not match:
        if expected==0:return 0
        raise RuntimeError("YouTube did not acknowledge a previously uploaded chunk")
    next_offset=int(match.group(1))+1
    if next_offset<expected or next_offset>expected+CHUNK_SIZE:
        raise RuntimeError("YouTube returned an unexpected upload acknowledgement")
    return next_offset


def send_chunk(payload,location,total,offset,data):
    end=offset+len(data)-1
    for attempt in range(MAX_TRIES):
        token=broker(payload, force=(attempt>0 and attempt%2==0))
        req=urllib.request.Request(location,data=data,method="PUT",headers={
            "Authorization":"Bearer "+token,"Content-Type":"video/mp4",
            "Content-Length":str(len(data)),
            "Content-Range":f"bytes {offset}-{end}/{total}"
        })
        try:
            with urllib.request.urlopen(req,timeout=600) as response:
                body=response.read(1024*1024)
                if response.status in (200,201):
                    video=json.loads(body.decode("utf-8"))
                    video_id=video.get("id","")
                    if not re.fullmatch(r"[A-Za-z0-9_-]{8,20}",video_id):
                        raise RuntimeError("YouTube accepted media without a confirmed video ID. Check Studio before retrying")
                    return end+1,video_id
                raise RuntimeError("Unexpected YouTube upload response")
        except urllib.error.HTTPError as error:
            if error.code == 308:
                next_offset=parse_resumable_ack(error.headers.get("Range",""),offset)
                if next_offset!=end+1:
                    raise RuntimeError("YouTube acknowledged only part of a chunk; manual recovery is required")
                return next_offset,None
            if error.code==401:
                broker(payload,force=True)
            elif error.code not in (429,500,502,503,504):
                raise RuntimeError(f"YouTube rejected the upload with HTTP {error.code}") from error
        except (OSError,urllib.error.URLError) as error:
            if attempt==MAX_TRIES-1:raise RuntimeError("Network failed during YouTube upload; check Studio before another attempt") from error
        if attempt<MAX_TRIES-1:time.sleep(min(3*(attempt+1),12))
    raise RuntimeError("YouTube resumable upload failed after retries; inspect YouTube Studio")


def finish_thumbnail(payload):
    url=payload.get("thumbnail_url")
    if not url:return
    req=urllib.request.Request(url,headers={"User-Agent":"video-producer-youtube-worker"})
    with urllib.request.urlopen(req,timeout=120) as response:
        mime=response.headers.get("Content-Type","image/jpeg").split(";")[0]
        if mime not in ("image/jpeg","image/png"):
            raise RuntimeError("Thumbnail must be JPEG or PNG")
        data=response.read(5*1024*1024+1)
        if not data or len(data)>5*1024*1024:
            raise RuntimeError("Custom thumbnail must be no more than 5 MB")
    dest="https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId="+payload["video_id"]
    req=urllib.request.Request(dest,data=data,method="POST",headers={
        "Authorization":"Bearer "+broker(payload,force=True),
        "Content-Type":mime
    })
    with urllib.request.urlopen(req,timeout=120) as response:
        response.read(4096)


def finish_playlist(payload):
    playlist=payload.get("playlist_id")
    if not playlist:return
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,120}",playlist):
        raise RuntimeError("Invalid YouTube playlist identifier")
    request_json("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",{
        "snippet":{"playlistId":playlist,
                   "resourceId":{"kind":"youtube#video","videoId":payload["video_id"]}}
    },{"Authorization":"Bearer "+broker(payload,force=True)})


def main(payload):
    required=("callback_token","callback_url","token_url","source_url","channel_handle",
              "title","publish_at")
    for key in required:
        if not isinstance(payload.get(key),str) or not payload[key]:
            raise RuntimeError("Missing required scheduled upload field: "+key)
    if payload["channel_handle"].lower().find("cornerstone")!=-1:
        raise RuntimeError("Cornerstone cannot be a Video Producer destination")
    token=broker(payload)
    if not token:raise RuntimeError("Unable to authorize YouTube account")
    total=source_length(payload["source_url"])
    callback(payload,"uploading",0,"Initializing resumable YouTube upload")
    location=upload_session(payload,total)
    offset=0
    video_id=None
    last_progress=-1
    while offset<total:
        size=min(CHUNK_SIZE,total-offset)
        data=read_source_chunk(payload["source_url"],offset,size,total)
        offset,video_id=send_chunk(payload,location,total,offset,data)
        progress=int(offset*100/total)
        if video_id:break
        if progress>=last_progress+4:
            callback(payload,"uploading",min(progress,99),"Uploading private review master")
            last_progress=progress
    if not video_id:
        raise RuntimeError("YouTube did not confirm a scheduled video ID. Check Studio before retrying")
    payload["video_id"]=video_id
    # This callback is the idempotency boundary. Never re-upload if it fails.
    callback(payload,"accepted",100,"YouTube accepted scheduled video",video_id=video_id)
    warnings=[]
    for title,operation in (("thumbnail",finish_thumbnail),("playlist",finish_playlist)):
        try:operation(payload)
        except Exception as error:warnings.append(f"{title} setup failed: {error}")
    callback(payload,"completed",100,"YouTube accepted video and metadata",warnings=warnings)
    print(json.dumps({"status":"submitted","videoId":video_id,"warnings":warnings}),flush=True)


if __name__=="__main__":
    payload=None
    try:
        if len(sys.argv)!=2:raise RuntimeError("usage: video_producer_youtube_schedule_worker.py payload.json")
        with open(sys.argv[1],encoding="utf-8") as handle:payload=json.load(handle)
        main(payload)
    except Exception as error:
        print("YouTube scheduled upload error: "+str(error),file=sys.stderr,flush=True)
        if payload and not payload.get("video_id"):
            try:callback(payload,"failed",error=str(error))
            except Exception:print("Could not report failed YouTube job; inspect Studio before retry",file=sys.stderr)
        raise
