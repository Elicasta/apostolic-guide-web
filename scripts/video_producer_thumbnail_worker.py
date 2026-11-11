#!/usr/bin/env python3
"""Make two 1280 x 720 A/B YouTube thumbnails using real video frames only.

OpenCV scores actual neighboring frames when available. No generative face,
face replacement or synthetic-expression processing is performed.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request


WIDTH, HEIGHT = 1280, 720
FRAME_OFFSETS = (-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5)


def download(url, target):
    request = urllib.request.Request(url, headers={"User-Agent": "apostolic-guide-video-producer"})
    with urllib.request.urlopen(request, timeout=180) as response, open(target, "wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)


def upload(url, path):
    subprocess.run([
        "curl", "--fail", "--silent", "--show-error", "--request", "PUT",
        "--header", "content-type: image/jpeg", "--upload-file", path, url
    ], check=True)


def callback(payload, status, error=None):
    body = json.dumps({
        "projectId": payload["project_id"],
        "token": payload["callback_token"],
        "status": status,
        "error": error
    }).encode("utf-8")
    request = urllib.request.Request(
        payload["callback_url"], data=body, method="POST",
        headers={"content-type": "application/json", "user-agent": "apostolic-guide-thumbnail-worker"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        response.read()


def textfile(path, value):
    clean = " ".join(re.sub(r"[\u2010-\u2015-]", " ", str(value or "")).strip().split()).upper()
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(clean[:80])


def safe_color(value, fallback):
    raw = str(value or "").lstrip("#")
    return raw if re.fullmatch(r"[0-9A-Fa-f]{6}", raw) else fallback


def draw_filter(variant, headline_file, pathway_file, colors=None):
    colors = colors or {}
    ink = safe_color(colors.get("ink"), "0E1E2D")
    accent = safe_color(colors.get("accent"), "B3212D")
    paper = safe_color(colors.get("paper"), "FFF9F2")
    common = (
        "scale=1280:720:force_original_aspect_ratio=increase:"
        "flags=lanczos,crop=1280:720,eq=contrast=1.045:saturation=1.02"
    )
    # FFmpeg draws the background box and text from the same glyph metrics.
    # Vertical padding 0.22em, horizontal 0.35em, text optically raised 0.02em.
    font_size = 76
    headline = (
        f"drawtext=font='Bebas Neue':textfile='{headline_file}':reload=0:"
        f"fontcolor=white:fontsize={font_size}:line_spacing=5:"
        f"box=1:boxcolor=0x{accent}@0.96:boxborderw=17|27|17|27"
    )
    label = (
        f"drawtext=font='Montserrat':textfile='{pathway_file}':reload=0:"
        f"fontcolor=0x{paper}@1:fontsize=24"
    )
    if variant in ("A", "face-hook"):
        return ",".join([
            common,
            f"drawbox=x=0:y=0:w=710:h=720:color=0x{ink}@0.78:t=fill",
            label + ":x=80:y=130",
            headline + ":x=80:y=(h-text_h)/2-2"
        ])
    return ",".join([
        common,
        f"drawbox=x=0:y=435:w=1280:h=285:color=0x{ink}@0.88:t=fill",
        label + ":x=(w-text_w)/2:y=480",
        headline + ":x=(w-text_w)/2:y=565"
    ])


def _sample_frame(source, time, target):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", f"{max(0, time):.3f}", "-i", source, "-frames:v", "1",
        "-vf", "scale=960:540:force_original_aspect_ratio=increase,crop=960:540",
        "-q:v", "4", target
    ], check=True)


def _score_face_frame(frame):
    """Open eyes, frontal face, relaxed mouth, hands near face, sharpness.

    This is an evidence-based *heuristic*, not an expression classifier.
    Missing detection lowers the score rather than changing the real pixels.
    """
    try:
        import cv2
        import numpy as np
    except ImportError:
        return 0.0
    image = cv2.imread(frame)
    if image is None:
        return -1e6
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    face_model = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    eye_model = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
    faces = face_model.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(60, 60))
    sharpness = min(6, cv2.Laplacian(gray, cv2.CV_64F).var() / 55)
    if not len(faces):
        return sharpness - 30
    x, y, w, h = max(faces, key=lambda face: int(face[2]) * int(face[3]))
    roi = gray[y:y + int(.57 * h), x:x + w]
    eyes = eye_model.detectMultiScale(roi, scaleFactor=1.08, minNeighbors=4, minSize=(10, 10))
    # Two eyes at comparable vertical positions suggest open eyes and gaze
    # toward the camera, rather than a turned-away face.
    eyes = sorted(eyes, key=lambda eye: eye[2] * eye[3], reverse=True)[:2]
    eye_score = 12 if len(eyes) == 2 else 4 if eyes else -10
    if len(eyes) == 2:
        eye_score += 5 if abs(eyes[0][1] - eyes[1][1]) < .15 * h else -6
    center = abs((x + w / 2) - image.shape[1] / 2) / image.shape[1]
    centered_score = 14 * (1 - min(1, center * 2))
    face_size = min(6, 20 * (w * h) / (image.shape[0] * image.shape[1]))
    # A large dark inner-mouth opening in the lower third is penalized.
    mouth = gray[y + int(.68 * h):y + int(.91 * h), x + int(.22 * w):x + int(.78 * w)]
    dark_fraction = float(np.mean(mouth < 60)) if mouth.size else 1.0
    closed_mouth_score = 7 if dark_fraction < .23 else -7
    # Skin-colored foreground near the face sides may indicate a raised hand.
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    skin = cv2.inRange(hsv, (0, 25, 55), (25, 175, 255))
    pad = int(w * .34)
    left = skin[max(0, y):min(image.shape[0], y+h), max(0, x-pad):max(0, x)]
    right = skin[max(0, y):min(image.shape[0], y+h), min(image.shape[1], x+w):min(image.shape[1], x+w+pad)]
    side_skin = max(float(np.mean(z > 0)) if z.size else 0 for z in (left, right))
    hand_penalty = 8 if side_skin > .47 else 0
    return 20 + sharpness + eye_score + centered_score + face_size + closed_mouth_score - hand_penalty


def select_source_frame(source, timestamp, directory):
    """Pick the most usable real frame around the editor's source timestamp."""
    duration = None
    inspected = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                "format=duration", "-of", "default=nw=1:nk=1", source],
                               capture_output=True, text=True)
    if inspected.returncode == 0:
        try:
            duration = float(inspected.stdout.strip())
        except ValueError:
            pass
    candidates = []
    for index, offset in enumerate(FRAME_OFFSETS):
        time = max(0, float(timestamp) + offset)
        if duration is not None:
            time = min(time, max(0, duration - .1))
        sample = os.path.join(directory, f"sample-{index}.jpg")
        try:
            _sample_frame(source, time, sample)
            if os.path.getsize(sample) > 1024:
                candidates.append((time, _score_face_frame(sample)))
        except (OSError, subprocess.CalledProcessError):
            continue
    if not candidates:
        raise RuntimeError("No genuine frames could be extracted for the thumbnail")
    return max(candidates, key=lambda item: item[1])[0]


def render_variant(source, variant, headline, pathway, timestamp, output, directory, colors=None):
    headline_file = os.path.join(directory, f"{variant}-headline.txt")
    pathway_file = os.path.join(directory, f"{variant}-pathway.txt")
    textfile(headline_file, headline)
    textfile(pathway_file, pathway)
    vf = draw_filter(variant, headline_file, pathway_file, colors)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-ss", f"{max(0, float(timestamp)):.3f}", "-i", source,
        "-frames:v", "1", "-vf", vf, "-q:v", "2", output
    ], check=True)
    if not os.path.exists(output) or os.path.getsize(output) < 1024:
        raise RuntimeError(f"Thumbnail {variant} was not created")
    probe = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
        "stream=width,height", "-of", "csv=p=0", output
    ], text=True).strip()
    if probe != f"{WIDTH},{HEIGHT}":
        raise RuntimeError(f"Thumbnail size invalid: expected {WIDTH}x{HEIGHT}, got {probe}")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: video_producer_thumbnail_worker.py payload.json")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    for key in ("project_id", "source_url", "variants", "callback_url", "callback_token"):
        if not payload.get(key):
            raise RuntimeError(f"Missing payload field: {key}")
    with tempfile.TemporaryDirectory(prefix="ag-thumbnail-") as directory:
        source = os.path.join(directory, "source-video")
        download(payload["source_url"], source)
        offset = float(payload.get("source_range_start") or 0)
        label = payload.get("pathway_title") or "Video Producer"
        colors = payload.get("brand_colors") or {}
        for item in payload["variants"]:
            variant = item["variant"]
            if variant not in ("A", "B"):
                raise RuntimeError("Thumbnail variant must be A or B")
            output = os.path.join(directory, f"{variant}.jpg")
            source_timestamp = offset + float(item.get("sourceTimestamp") or 0)
            selected = select_source_frame(source, source_timestamp, directory)
            print("Selected genuine source frame", variant, selected, flush=True)
            render_variant(source, variant, item.get("headline") or label, label,
                           selected, output, directory, colors)
            upload(item["outputUploadUrl"], output)
        callback(payload, "completed")


if __name__ == "__main__":
    payload = None
    try:
        if len(sys.argv) > 1:
            with open(sys.argv[1], "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        main()
    except Exception as error:
        if payload:
            try:
                callback(payload, "failed", str(error))
            except Exception as callback_error:
                print(f"Thumbnail failure callback failed: {callback_error}", file=sys.stderr)
        raise
