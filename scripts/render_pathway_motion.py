#!/usr/bin/env python3
"""Deterministic renderer for Apostolic Motion Engine scene plans.

The web studio saves a compact scene plan in project.style.motionEngine.plan.
This module turns that exact plan into ASS vector/text animation so the GitHub
renderer and browser preview are driven by the same direction instead of two
unrelated templates.
"""
from __future__ import annotations

from pathlib import Path
import math

CREAM = "&H00E8F0F4"
MUTED = "&H0098A49F"
RED = "&H003D2BA6"
BLUE = "&H00A47B53"
PANEL = "&H00342A24"
DARK = "&H0020160B"


def _engine(payload: dict) -> dict:
    style = payload.get("style")
    if not isinstance(style, dict):
        return {}
    engine = style.get("motionEngine")
    return engine if isinstance(engine, dict) else {}


def motion_enabled(payload: dict) -> bool:
    engine = _engine(payload)
    plan = engine.get("plan")
    return bool(engine.get("version") == 1 and isinstance(plan, dict) and isinstance(plan.get("scenes"), list) and plan.get("scenes"))


def _plan(payload: dict) -> dict:
    engine = _engine(payload)
    value = engine.get("plan")
    return value if isinstance(value, dict) else {}


def _scenes(payload: dict) -> list[dict]:
    raw = _plan(payload).get("scenes")
    return [row for row in raw if isinstance(row, dict)] if isinstance(raw, list) else []


def _ass_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    seconds -= hours * 3600
    minutes = int(seconds // 60)
    seconds -= minutes * 60
    return f"{hours}:{minutes:02d}:{seconds:05.2f}"


def _clock_time(seconds: float) -> str:
    total = max(0, int(seconds))
    return f"{total // 60}:{total % 60:02d}"


def _escape(value: object, limit: int = 500) -> str:
    return str(value or "").strip()[:limit].replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}").replace("\n", "\\N")


def _clean_body(value: object) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= 190:
        return text
    shortened = text[:187].rsplit(" ", 1)[0]
    return f"{shortened}…"


def _shape_path_circle(radius: int, points: int = 30) -> str:
    coords: list[tuple[int, int]] = []
    for index in range(points):
        angle = (math.pi * 2 * index) / points
        coords.append((round(math.cos(angle) * radius), round(math.sin(angle) * radius)))
    first = coords[0]
    return f"m {first[0]} {first[1]} " + " ".join(f"l {x} {y}" for x, y in coords[1:]) + " c"


def _shape_path_rect(width: int, height: int, centered: bool = True) -> str:
    if centered:
        x = width // 2
        y = height // 2
        return f"m {-x} {-y} l {x} {-y} {x} {y} {-x} {y} c"
    return f"m 0 0 l {width} 0 {width} {height} 0 {height} c"


def _shape_event(lines: list[str], start: float, end: float, x: int, y: int, path: str, color: str = CREAM, alpha: str = "30", delay: float = 0.0, scale_from: int = 94, rotate: float = 0.0) -> None:
    begin = min(max(start, start + delay), max(start, end - 0.08))
    local_duration = max(80, int((end - begin) * 1000))
    tags = (
        f"{{\\an7\\pos({x},{y})\\p1\\c{color}\\alpha&H{alpha}&"
        f"\\fscx{scale_from}\\fscy{scale_from}\\frz{rotate:.2f}"
        f"\\fad(180,220)\\t(0,{min(520, local_duration)},\\fscx100\\fscy100)}}"
    )
    lines.append(f"Dialogue: 1,{_ass_time(begin)},{_ass_time(end)},MotionShape,,0,0,0,,{tags}{path}{{\\p0}}\n")


def _circle(lines: list[str], start: float, end: float, x: int, y: int, radius: int, color: str = CREAM, delay: float = 0.0, alpha: str = "28", ring: bool = True) -> None:
    _shape_event(lines, start, end, x, y, _shape_path_circle(radius), color, alpha, delay)
    if ring and radius >= 28:
        _shape_event(lines, start, end, x, y, _shape_path_circle(max(4, radius - max(3, radius // 18))), DARK, "00", delay + 0.035, 96)


def _line(lines: list[str], start: float, end: float, x1: int, y1: int, x2: int, y2: int, color: str = CREAM, delay: float = 0.0, thickness: int = 5, alpha: str = "25") -> None:
    dx = x2 - x1
    dy = y2 - y1
    length = max(2, round(math.hypot(dx, dy)))
    angle = math.degrees(math.atan2(dy, dx))
    x = round((x1 + x2) / 2)
    y = round((y1 + y2) / 2)
    _shape_event(lines, start, end, x, y, _shape_path_rect(length, thickness), color, alpha, delay, 82, angle)


def _text_event(lines: list[str], start: float, end: float, style: str, text: object, x: int, y: int, delay: float = 0.0, move: int = 18, align: int = 5, color: str | None = None) -> None:
    value = _escape(text)
    if not value:
        return
    begin = min(max(start, start + delay), max(start, end - 0.08))
    tags = f"{{\\an{align}\\move({x + move},{y},{x},{y},0,440)\\fad(190,230)"
    if color:
        tags += f"\\c{color}"
    tags += "}"
    lines.append(f"Dialogue: 5,{_ass_time(begin)},{_ass_time(end)},{style},,0,0,0,,{tags}{value}\n")


def _copy_layout(spec: dict) -> tuple[int, int, int, int]:
    width, height = int(spec["width"]), int(spec["height"])
    if height > width:
        return width // 2, round(height * .62), width // 2, round(height * .34)
    if abs(width - height) < width * .12:
        return width // 2, round(height * .66), width // 2, round(height * .34)
    return round(width * .34), round(height * .48), round(width * .73), round(height * .47)


def _scene_copy(lines: list[str], scene: dict, start: float, end: float, spec: dict) -> None:
    copy_x, copy_y, _, _ = _copy_layout(spec)
    visual = str(scene.get("visual", "scripture-scroll"))
    if visual == "brand-reveal":
        copy_x = int(spec["width"]) // 2
        copy_y = round(int(spec["height"]) * (.69 if int(spec["height"]) <= int(spec["width"]) else .62))
    _text_event(lines, start, end, "MotionEyebrow", scene.get("eyebrow") or scene.get("reference"), copy_x, copy_y - 122, 0.05, 12, 5, RED)
    _text_event(lines, start, end, "MotionTitle", scene.get("headline"), copy_x, copy_y, 0.12, 24, 5)
    body = _clean_body(scene.get("body"))
    if body:
        _text_event(lines, start, end, "MotionBody", body, copy_x, copy_y + 118, 0.24, 14, 5, MUTED)


def _art(lines: list[str], scene: dict, start: float, end: float, spec: dict) -> None:
    _, _, cx, cy = _copy_layout(spec)
    width, height = int(spec["width"]), int(spec["height"])
    unit = max(1.0, min(width / 1920, height / 1080))
    visual = str(scene.get("visual", "scripture-scroll"))
    r = round(150 * unit)

    if visual == "opening-question":
        _circle(lines, start, end, cx, cy, round(190 * unit), CREAM, .02, "42")
        _circle(lines, start, end, cx, cy, round(138 * unit), RED, .10, "18")
        _text_event(lines, start, end, "MotionGlyph", "?", cx, cy + round(12 * unit), .18, 0, 5)
        _line(lines, start, end, cx - r, cy + round(190 * unit), cx + r, cy + round(190 * unit), RED, .30, max(4, round(7 * unit)))
        return

    if visual == "brand-reveal":
        _circle(lines, start, end, cx, cy - round(80 * unit), round(150 * unit), CREAM, .02, "38")
        _line(lines, start, end, cx - round(150 * unit), cy - round(80 * unit), cx + round(150 * unit), cy - round(80 * unit), RED, .16, max(3, round(5 * unit)))
        return

    if visual == "shema":
        _circle(lines, start, end, cx, cy, round(180 * unit), CREAM, .02, "38")
        _circle(lines, start, end, cx, cy, round(105 * unit), RED, .10, "10")
        _text_event(lines, start, end, "MotionLabel", "ONE", cx, cy + round(8 * unit), .20, 0, 5)
        _line(lines, start, end, cx - round(250 * unit), cy, cx - round(190 * unit), cy, CREAM, .28, max(3, round(4 * unit)))
        _line(lines, start, end, cx + round(190 * unit), cy, cx + round(250 * unit), cy, CREAM, .32, max(3, round(4 * unit)))
        return

    if visual == "no-rival":
        _circle(lines, start, end, cx, cy, round(112 * unit), RED, .02, "12")
        _text_event(lines, start, end, "MotionLabelSmall", "ONE GOD", cx, cy + round(6 * unit), .12, 0, 5)
        offsets = [(-220, -120), (220, -120), (-220, 120), (220, 120)]
        for index, (ox, oy) in enumerate(offsets):
            px, py = cx + round(ox * unit), cy + round(oy * unit)
            _circle(lines, start, end, px, py, round(48 * unit), CREAM, .16 + index * .04, "58")
            _line(lines, start, end, px - round(40 * unit), py + round(40 * unit), px + round(40 * unit), py - round(40 * unit), RED, .25 + index * .04, max(4, round(7 * unit)), "08")
        return

    if visual == "jesus-shema":
        _circle(lines, start, end, cx, cy - round(60 * unit), round(125 * unit), CREAM, .02, "48")
        _circle(lines, start, end, cx, cy - round(60 * unit), round(90 * unit), RED, .08, "12")
        _circle(lines, start, end, cx, cy - round(94 * unit), round(33 * unit), CREAM, .16, "20")
        _line(lines, start, end, cx, cy - round(55 * unit), cx, cy + round(72 * unit), CREAM, .20, max(4, round(7 * unit)), "12")
        _line(lines, start, end, cx, cy - round(20 * unit), cx - round(76 * unit), cy + round(32 * unit), CREAM, .25, max(4, round(6 * unit)), "12")
        _line(lines, start, end, cx, cy - round(20 * unit), cx + round(82 * unit), cy + round(18 * unit), CREAM, .29, max(4, round(6 * unit)), "12")
        _text_event(lines, start, end, "MotionLabelSmall", "ONE LORD", cx, cy + round(170 * unit), .38, 0, 5)
        return

    if visual == "true-god":
        _circle(lines, start, end, cx, cy, round(165 * unit), CREAM, .02, "38")
        _circle(lines, start, end, cx, cy, round(104 * unit), RED, .10, "12")
        for index in range(10):
            angle = math.pi * 2 * index / 10
            x1 = cx + round(math.cos(angle) * 195 * unit)
            y1 = cy + round(math.sin(angle) * 195 * unit)
            x2 = cx + round(math.cos(angle) * 230 * unit)
            y2 = cy + round(math.sin(angle) * 230 * unit)
            _line(lines, start, end, x1, y1, x2, y2, CREAM, .16 + index * .015, max(2, round(4 * unit)), "35")
        _text_event(lines, start, end, "MotionLabelSmall", "TRUE GOD", cx, cy + round(6 * unit), .28, 0, 5)
        return

    if visual == "apostolic-witness":
        page_w = round(190 * unit)
        page_h = round(250 * unit)
        _shape_event(lines, start, end, cx - page_w // 2, cy, _shape_path_rect(page_w, page_h), CREAM, "68", .02)
        _shape_event(lines, start, end, cx + page_w // 2, cy, _shape_path_rect(page_w, page_h), CREAM, "68", .06)
        _line(lines, start, end, cx, cy - page_h // 2, cx, cy + page_h // 2, RED, .12, max(4, round(6 * unit)), "05")
        for index in range(3):
            yy = cy - round(60 * unit) + index * round(54 * unit)
            _line(lines, start, end, cx - round(155 * unit), yy, cx - round(36 * unit), yy, CREAM, .18 + index * .05, max(2, round(3 * unit)), "55")
            _line(lines, start, end, cx + round(36 * unit), yy, cx + round(155 * unit), yy, CREAM, .20 + index * .05, max(2, round(3 * unit)), "55")
        _text_event(lines, start, end, "MotionLabelSmall", "APOSTOLIC WITNESS", cx, cy + round(190 * unit), .36, 0, 5)
        return

    if visual == "one-mediator":
        _circle(lines, start, end, cx, cy - round(150 * unit), round(64 * unit), RED, .02, "12")
        _text_event(lines, start, end, "MotionTiny", "GOD", cx, cy - round(146 * unit), .11, 0, 5)
        _line(lines, start, end, cx, cy - round(84 * unit), cx, cy + round(92 * unit), CREAM, .14, max(4, round(6 * unit)), "15")
        _circle(lines, start, end, cx, cy + round(135 * unit), round(40 * unit), CREAM, .25, "22")
        _text_event(lines, start, end, "MotionTiny", "ONE", cx, cy + round(138 * unit), .32, 0, 5)
        return

    if visual == "belief":
        _circle(lines, start, end, cx, cy, round(140 * unit), RED, .02, "12")
        _text_event(lines, start, end, "MotionLabel", "ONE", cx, cy + round(7 * unit), .12, 0, 5)
        for index in range(3):
            _circle(lines, start, end, cx, cy, round((190 + index * 42) * unit), CREAM, .18 + index * .07, "68")
        return

    if visual == "creator":
        _circle(lines, start, end, cx, cy, round(145 * unit), CREAM, .02, "35")
        for index in range(8):
            angle = math.pi * 2 * index / 8
            px = cx + round(math.cos(angle) * (205 + index % 2 * 30) * unit)
            py = cy + round(math.sin(angle) * (205 + index % 2 * 30) * unit)
            _circle(lines, start, end, px, py, max(4, round((7 + index % 2 * 3) * unit)), RED if index % 3 == 0 else CREAM, .18 + index * .035, "15", False)
        _text_event(lines, start, end, "MotionLabelSmall", "CREATION", cx, cy + round(7 * unit), .30, 0, 5)
        return

    if visual == "word-flesh":
        box_w, box_h = round(190 * unit), round(112 * unit)
        _shape_event(lines, start, end, cx - round(180 * unit), cy, _shape_path_rect(box_w, box_h), CREAM, "65", .02)
        _text_event(lines, start, end, "MotionLabelSmall", "WORD", cx - round(180 * unit), cy + round(6 * unit), .08, 0, 5)
        _line(lines, start, end, cx - round(70 * unit), cy, cx + round(80 * unit), cy, RED, .15, max(4, round(7 * unit)), "08")
        _circle(lines, start, end, cx + round(190 * unit), cy - round(55 * unit), round(30 * unit), CREAM, .25, "20")
        _line(lines, start, end, cx + round(190 * unit), cy - round(20 * unit), cx + round(190 * unit), cy + round(90 * unit), CREAM, .29, max(4, round(6 * unit)), "15")
        _text_event(lines, start, end, "MotionLabelSmall", "FLESH", cx + round(190 * unit), cy + round(142 * unit), .36, 0, 5)
        return

    if visual == "invisible-visible":
        _circle(lines, start, end, cx - round(150 * unit), cy, round(105 * unit), CREAM, .02, "42")
        _circle(lines, start, end, cx - round(150 * unit), cy, round(65 * unit), RED, .09, "14")
        _line(lines, start, end, cx - round(32 * unit), cy, cx + round(72 * unit), cy, RED, .18, max(4, round(7 * unit)), "08")
        _circle(lines, start, end, cx + round(178 * unit), cy - round(50 * unit), round(30 * unit), CREAM, .27, "20")
        _line(lines, start, end, cx + round(178 * unit), cy - round(15 * unit), cx + round(178 * unit), cy + round(92 * unit), CREAM, .31, max(4, round(6 * unit)), "15")
        return

    if visual == "water-name":
        for index in range(3):
            yy = cy - round(70 * unit) + index * round(70 * unit)
            _line(lines, start, end, cx - round(220 * unit), yy, cx + round(220 * unit), RED if index == 1 else CREAM, .08 + index * .09, max(3, round(5 * unit)), "18" if index == 1 else "48")
        _text_event(lines, start, end, "MotionLabelSmall", "JESUS' NAME", cx, cy + round(190 * unit), .34, 0, 5)
        return

    if visual == "spirit-fire":
        flame = f"m 0 {-round(150 * unit)} l {round(82 * unit)} {round(25 * unit)} {round(42 * unit)} {round(135 * unit)} 0 {round(170 * unit)} {-round(62 * unit)} {round(112 * unit)} {-round(88 * unit)} {round(15 * unit)} c"
        _shape_event(lines, start, end, cx, cy, flame, RED, "08", .02)
        _text_event(lines, start, end, "MotionLabelSmall", "SPIRIT", cx, cy + round(210 * unit), .28, 0, 5)
        return

    if visual == "authority":
        throne = f"m {-round(150 * unit)} {round(100 * unit)} l {-round(110 * unit)} {-round(120 * unit)} {round(110 * unit)} {-round(120 * unit)} {round(150 * unit)} {round(100 * unit)} c"
        _shape_event(lines, start, end, cx, cy, throne, CREAM, "68", .02)
        _circle(lines, start, end, cx, cy - round(160 * unit), round(52 * unit), RED, .10, "12")
        _line(lines, start, end, cx - round(170 * unit), cy + round(105 * unit), cx + round(170 * unit), cy + round(105 * unit), RED, .21, max(4, round(7 * unit)), "08")
        return

    if visual == "gospel-pattern":
        labels = ["DEATH", "BURIAL", "RISEN"]
        for index, label in enumerate(labels):
            px = cx + round((-190 + index * 190) * unit)
            _circle(lines, start, end, px, cy, round(62 * unit), RED if index == 2 else CREAM, .04 + index * .09, "12" if index == 2 else "30")
            _text_event(lines, start, end, "MotionTiny", label, px, cy + round(4 * unit), .14 + index * .09, 0, 5)
            if index < 2:
                _line(lines, start, end, px + round(72 * unit), cy, px + round(118 * unit), cy, CREAM, .20 + index * .09, max(3, round(4 * unit)), "35")
        return

    if visual == "recap-map":
        labels = ["LAW", "PROPHETS", "JESUS", "APOSTLES", "CHURCH"]
        left = cx - round(260 * unit)
        right = cx + round(260 * unit)
        _line(lines, start, end, left, cy, right, cy, RED, .02, max(3, round(5 * unit)), "14")
        step = (right - left) / 4
        for index, label in enumerate(labels):
            px = round(left + step * index)
            _circle(lines, start, end, px, cy, round(28 * unit), RED if label == "JESUS" else CREAM, .08 + index * .055, "12" if label == "JESUS" else "30")
            _text_event(lines, start, end, "MotionTiny", label, px, cy + round(75 * unit), .15 + index * .055, 0, 5, MUTED)
        return

    if visual == "cta":
        _shape_event(lines, start, end, cx, cy, _shape_path_rect(round(460 * unit), round(230 * unit)), CREAM, "68", .02)
        _line(lines, start, end, cx - round(150 * unit), cy - round(32 * unit), cx + round(150 * unit), cy - round(32 * unit), RED, .13, max(4, round(7 * unit)), "08")
        _text_event(lines, start, end, "MotionLabelSmall", "APOSTOLICGUIDE.COM", cx, cy + round(42 * unit), .23, 0, 5)
        return

    # Scripture-scroll fallback.
    _shape_event(lines, start, end, cx, cy, _shape_path_rect(round(390 * unit), round(300 * unit)), CREAM, "70", .02)
    for index in range(5):
        yy = cy - round(90 * unit) + index * round(48 * unit)
        _line(lines, start, end, cx - round(150 * unit), yy, cx + round((120 if index == 4 else 150) * unit), yy, CREAM, .10 + index * .055, max(2, round(3 * unit)), "55")
    _circle(lines, start, end, cx + round(168 * unit), cy + round(128 * unit), round(26 * unit), RED, .38, "12")


def make_motion_ass(path: Path, payload: dict, duration: float, spec: dict) -> None:
    width, height = int(spec["width"]), int(spec["height"])
    margin = int(spec["margin"])
    title_size = max(42, round(float(spec["title_size"]) * .88))
    body_size = max(22, round(float(spec["body_size"]) * .88))
    eyebrow_size = max(18, round(float(spec["eyebrow_size"]) * .86))
    label_size = max(28, round(title_size * .55))
    tiny_size = max(16, round(eyebrow_size * .72))
    glyph_size = max(92, round(title_size * 2.2))
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: MotionShape,Noto Sans,20,{CREAM},{CREAM},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: MotionEyebrow,Noto Sans,{eyebrow_size},{CREAM},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,3,0,1,0,0,5,{margin},{margin},0,1
Style: MotionTitle,Noto Serif,{title_size},{CREAM},{CREAM},&H00000000,&H00000000,0,0,0,0,100,100,-1,0,1,0,0,5,{margin},{margin},0,1
Style: MotionBody,Noto Sans,{body_size},{MUTED},{CREAM},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,{margin},{margin},0,1
Style: MotionLabel,Noto Sans,{label_size},{CREAM},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,5,0,0,0,1
Style: MotionLabelSmall,Noto Sans,{max(20, round(label_size * .68))},{CREAM},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,5,0,0,0,1
Style: MotionTiny,Noto Sans,{tiny_size},{MUTED},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,5,0,0,0,1
Style: MotionGlyph,Noto Sans,{glyph_size},{CREAM},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,-2,0,1,0,0,5,0,0,0,1
Style: MotionMeta,Noto Sans,{max(14, round(width * .009))},{MUTED},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,7,{margin},{margin},0,1
Style: MotionMetaRight,Noto Sans,{max(14, round(width * .0085))},{MUTED},{CREAM},&H00000000,&H00000000,-1,0,0,0,100,100,2,0,1,0,0,9,{margin},{margin},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [header]
    title = _escape(payload.get("title", "Pathway"), 120).upper()
    lines.append(f"Dialogue: 8,{_ass_time(0)},{_ass_time(duration)},MotionMetaRight,,0,0,0,,{{\\pos({width - margin},{margin})}}MOTION ENGINE 0.1 · {title}\n")

    scenes = _scenes(payload)
    valid: list[tuple[dict, float, float]] = []
    for index, scene in enumerate(scenes):
        start = max(0.0, min(duration, float(scene.get("start", 0) or 0)))
        next_start = duration
        if index + 1 < len(scenes):
            next_start = max(start + .1, float(scenes[index + 1].get("start", duration) or duration))
        requested_end = float(scene.get("end", next_start) or next_start)
        end = min(duration, max(start + .1, min(requested_end, next_start)))
        if start >= duration:
            continue
        valid.append((scene, start, end))

    total = max(1, len(valid))
    tracker_y = int(spec.get("tracker_y", height - 120))
    tracker_title_y = int(spec.get("tracker_title_y", tracker_y + 34))
    for index, (scene, start, end) in enumerate(valid):
        _scene_copy(lines, scene, start, end, spec)
        _art(lines, scene, start, end, spec)
        reference = _escape(scene.get("reference") or scene.get("eyebrow") or title, 120).upper()
        headline = _escape(scene.get("headline") or scene.get("visual") or "SCENE", 120).upper()
        lines.append(f"Dialogue: 8,{_ass_time(start)},{_ass_time(end)},MotionMeta,,0,0,0,,{{\\pos({margin},{tracker_y})\\c{RED}}}{index + 1:02d} / {total:02d} · {reference}\n")
        lines.append(f"Dialogue: 8,{_ass_time(start)},{_ass_time(end)},MotionMeta,,0,0,0,,{{\\pos({margin},{tracker_title_y})}}{headline}\n")

    lines.append(f"Dialogue: 8,{_ass_time(0)},{_ass_time(duration)},MotionMetaRight,,0,0,0,,{{\\pos({width - margin},{tracker_title_y})}}{_clock_time(duration)}\n")
    path.write_text("".join(lines))
