#!/usr/bin/env python3
import glob
import json
import mimetypes
import os
import subprocess
import sys
import tempfile
import urllib.request
import uuid


def callback(payload, status, progress=None, stage=None, error=None, transcript=None):
    url = payload["callback_url"]
    body = {
        "project_id": payload["project_id"],
        "token": payload["callback_token"],
        "status": status,
    }
    if progress is not None:
        body["progress"] = int(progress)
    if stage:
        body["stage"] = stage
    if error:
        body["error"] = str(error)[:3000]
    if transcript is not None:
        body["transcript"] = transcript
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-video-producer-worker"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status >= 300:
            raise RuntimeError(f"callback failed ({response.status})")


def download(url, target):
    request = urllib.request.Request(url, headers={"user-agent": "apostolic-guide-video-producer-worker"})
    with urllib.request.urlopen(request, timeout=180) as response, open(target, "wb") as out:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)


def probe_duration(path):
    value = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path
    ], text=True).strip()
    duration = float(value)
    if duration <= 0:
        raise RuntimeError("ffprobe returned an invalid source duration")
    return duration


def extract_chunks(source, directory):
    pattern = os.path.join(directory, "audio-%03d.mp3")
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k",
        "-f", "segment", "-segment_time", "1800", "-reset_timestamps", "1", pattern
    ], check=True)
    chunks = sorted(glob.glob(os.path.join(directory, "audio-*.mp3")))
    if not chunks:
        raise RuntimeError("ffmpeg did not produce transcription audio")
    return chunks


def multipart_body(fields, file_field, file_path):
    boundary = "----AGVideoProducer" + uuid.uuid4().hex
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    filename = os.path.basename(file_path)
    content_type = mimetypes.guess_type(filename)[0] or "audio/mpeg"
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode())
    body.extend(f"Content-Type: {content_type}\r\n\r\n".encode())
    with open(file_path, "rb") as handle:
        body.extend(handle.read())
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def transcribe(api_key, model, audio_path):
    fields = [
        ("model", model),
        ("language", "en"),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
        ("timestamp_granularities[]", "segment"),
        ("temperature", "0"),
    ]
    data, content_type = multipart_body(fields, "file", audio_path)
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=data,
        method="POST",
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": content_type,
            "user-agent": "apostolic-guide-video-producer-worker",
        },
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: transcribe_video_producer_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    required = ["project_id", "source_url", "callback_url", "callback_token"]
    for key in required:
        if not payload.get(key):
            raise RuntimeError(f"missing payload field: {key}")

    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured in GitHub Actions secrets")
    model = payload.get("transcription_model") or "whisper-1"
    if model != "whisper-1":
        raise RuntimeError("word-level Video Producer timing currently requires whisper-1")

    callback(payload, "transcribing", 2, "Downloading source")
    with tempfile.TemporaryDirectory(prefix="ag-video-producer-transcribe-") as directory:
        source = os.path.join(directory, "source")
        download(payload["source_url"], source)
        duration = probe_duration(source)
        callback(payload, "transcribing", 8, "Extracting dialogue audio")
        chunks = extract_chunks(source, directory)

        words = []
        segments = []
        text_parts = []
        offset = 0.0
        for index, chunk in enumerate(chunks):
            progress = 10 + round((index / max(1, len(chunks))) * 78)
            callback(payload, "transcribing", progress, f"Transcribing part {index + 1} of {len(chunks)}")
            result = transcribe(api_key, model, chunk)
            chunk_duration = float(result.get("duration") or probe_duration(chunk))
            text = str(result.get("text") or "").strip()
            if text:
                text_parts.append(text)
            for item in result.get("words") or []:
                word = item.get("word")
                start = item.get("start")
                end = item.get("end")
                if isinstance(word, str) and isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start:
                    words.append({"word": word, "start": round(offset + float(start), 4), "end": round(offset + float(end), 4)})
            for item in result.get("segments") or []:
                text_value = item.get("text")
                start = item.get("start")
                end = item.get("end")
                if isinstance(text_value, str) and isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start:
                    segments.append({"text": text_value.strip(), "start": round(offset + float(start), 4), "end": round(offset + float(end), 4)})
            offset += chunk_duration

        if not words:
            raise RuntimeError("OpenAI transcription returned no word timestamps")
        transcript = {
            "text": " ".join(text_parts).strip(),
            "duration": round(duration, 4),
            "words": words,
            "segments": segments,
        }
        callback(payload, "completed", 100, "Transcript ready", transcript=transcript)


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) == 2:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload and payload.get("callback_url") and payload.get("callback_token") and payload.get("project_id"):
            try:
                callback(payload, "failed", 100, "Transcription failed", error=str(error))
            except Exception as callback_error:
                print(f"failure callback also failed: {callback_error}", file=sys.stderr)
        raise
