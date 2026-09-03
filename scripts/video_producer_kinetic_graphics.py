#!/usr/bin/env python3
"""Apostolic Guide Kinetic Graphics / 02.

Deterministic editorial motion typography for long-form Apostolic Guide video.
The Edit Director chooses faithful spoken copy and a semantic treatment. This
renderer owns the AG palette, typography, field wipes, split compositions,
staggered text, and the handoff from A-roll into a graphic beat and back.

No strike-through decoration, scribbles, fake handwriting, or diagonal marks are
allowed through readable copy. Legacy `strike` cues map to the clean impact system.
"""
from __future__ import annotations

import textwrap

# Canonical Apostolic Guide site tokens from app/globals.css.
# ASS uses BGR byte order.
AG_RED = "3D2DA1"       # RGB #A12D3D
AG_BONE = "F4F7F5"      # RGB #F5F7F4
AG_BLACK = "2A2010"     # RGB #10202A
AG_GRAY = "7D7766"      # RGB #66777D
AG_CHARCOAL = "443A26"  # RGB #263A44

HEADLINE_FONT = "Bebas Neue"
BODY_FONT = "Montserrat"


def ass_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def clean(value) -> str:
    return " ".join(str(value or "").strip().split())


def esc(value) -> str:
    text = str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
    # Reinstate intentional ASS line breaks authored by wrap_copy().
    return text.replace("\\\\N", "\\N")


def wrap_copy(value: str, width: int, max_lines: int = 3) -> str:
    source = clean(value)
    if not source:
        return ""
    lines = textwrap.wrap(source, width=max(8, width), break_long_words=False, break_on_hyphens=False)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .,:;-") + "…"
    return "\\N".join(lines)


def event(lines: list[str], start: float, end: float, text_value: str, *, layer: int = 20, style: str = "Base") -> None:
    if end <= start or not text_value:
        return
    lines.append(f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text_value}")


def rect(
    lines: list[str], start: float, end: float, x: float, y: float, width: float, height: float,
    color: str, *, alpha: str = "00", layer: int = 20, fade: bool = False
) -> None:
    prefix = "{\\fad(55,80)}" if fade else ""
    drawing = (
        f"{prefix}{{\\an7\\pos({int(x)},{int(y)})\\p1\\bord0\\shad0"
        f"\\1c&H{color}&\\1a&H{alpha}&}}"
        f"m 0 0 l {max(1, int(width))} 0 l {max(1, int(width))} {max(1, int(height))} l 0 {max(1, int(height))}"
        "{\\p0}"
    )
    event(lines, start, end, drawing, layer=layer, style="Shape")


def moving_rect(
    lines: list[str], start: float, end: float, from_x: float, from_y: float, to_x: float, to_y: float,
    width: float, height: float, color: str, *, layer: int = 26, move_ms: int = 280, alpha: str = "00"
) -> None:
    duration_ms = max(1, int((end - start) * 1000))
    move_ms = min(move_ms, duration_ms)
    drawing = (
        f"{{\\an7\\move({int(from_x)},{int(from_y)},{int(to_x)},{int(to_y)},0,{move_ms})"
        f"\\p1\\bord0\\shad0\\1c&H{color}&\\1a&H{alpha}&}}"
        f"m 0 0 l {max(1, int(width))} 0 l {max(1, int(width))} {max(1, int(height))} l 0 {max(1, int(height))}"
        "{\\p0}"
    )
    event(lines, start, end, drawing, layer=layer, style="Shape")


def text(
    lines: list[str], start: float, end: float, x: float, y: float, value: str, *, size: float,
    color: str = AG_BONE, align: int = 5, font: str = HEADLINE_FONT, layer: int = 30,
    bold: bool = True, spacing: float = 0, impact: bool = False, delay: float = 0,
    alpha: str = "00", move_from: tuple[float, float] | None = None, move_ms: int = 220
) -> None:
    value = clean(value).replace(" \\N ", "\\N").replace("\\N ", "\\N").replace(" \\N", "\\N")
    if not value:
        return
    start = start + max(0.0, delay)
    if end <= start:
        return
    duration_ms = max(1, int((end - start) * 1000))
    move_ms = min(move_ms, duration_ms)
    position = (
        f"\\move({int(move_from[0])},{int(move_from[1])},{int(x)},{int(y)},0,{move_ms})"
        if move_from else f"\\pos({int(x)},{int(y)})"
    )
    if impact:
        intro = "\\fad(35,75)\\fscx108\\fscy108\\t(0,180,\\fscx100\\fscy100)"
    else:
        intro = "\\fad(45,75)"
    tags = (
        f"{{\\an{align}{position}\\fn{font}\\fs{int(size)}\\c&H{color}&\\1a&H{alpha}&"
        f"\\b{1 if bold else 0}\\fsp{float(spacing):g}\\bord0\\shad0{intro}}}"
    )
    event(lines, start, end, tags + esc(value), layer=layer)


def fit_size(value: str, width: int, *, portrait: bool, max_size: int, min_size: int) -> int:
    source = clean(value)
    longest = max([len(line) for line in source.split("\\N")] or [1])
    ratio = 0.49 if portrait else 0.45
    estimated = int(width / max(1.0, longest * ratio))
    return max(min_size, min(max_size, estimated))


def split_support_lines(body: str, limit: int = 4) -> list[str]:
    raw = str(body or "").strip()
    if not raw:
        return []
    if "|" not in raw:
        one = clean(raw)
        return [one] if one else []
    return [clean(item) for item in raw.split("|") if clean(item)][:limit]


def split_questions(body: str) -> list[str]:
    raw = str(body or "").strip()
    if not raw:
        return []
    if "|" in raw:
        return split_support_lines(raw, 3)
    chunks = [clean(item) for item in raw.replace("? ", "?| ").split("|") if clean(item)]
    return chunks[:3]


def _phase_times(start: float, end: float) -> tuple[float, float, float, float]:
    duration = max(0.55, end - start)
    hit = min(1.05, max(0.62, duration * 0.27))
    hit_end = min(end, start + hit)
    wipe_start = max(start, hit_end - 0.10)
    card_start = min(end, wipe_start + min(0.28, max(0.14, duration * 0.07)))
    return hit_end, wipe_start, card_start, end


def _utility_label(lines: list[str], start: float, end: float, width: int, height: int, label: str = "AG / EMPHASIS") -> None:
    portrait = height > width
    x = width * (0.075 if portrait else 0.065)
    y = height * (0.10 if portrait else 0.105)
    rect(lines, start, end, x, y - 8, 7 if portrait else 5, 34 if portrait else 26, AG_RED, layer=28)
    text(lines, start, end, x + 20, y, label, size=23 if portrait else 17, color=AG_GRAY, align=4, font=BODY_FONT, bold=True, spacing=2.2, layer=29)


def _a_roll_hit(lines: list[str], start: float, hit_end: float, width: int, height: int, title: str, *, accent: bool = False) -> None:
    portrait = height > width
    rect(lines, start, hit_end, 0, 0, width, height, AG_BLACK, alpha="72", layer=18, fade=True)
    _utility_label(lines, start, hit_end, width, height)
    max_chars = 15 if portrait else 22
    wrapped = wrap_copy(title.upper(), max_chars, 3)
    max_width = int(width * (0.84 if portrait else 0.74))
    size = fit_size(wrapped, max_width, portrait=portrait, max_size=222 if portrait else 182, min_size=76 if portrait else 66)
    x = width * (0.08 if portrait else 0.075)
    y = height * (0.53 if portrait else 0.54)
    color = AG_RED if accent else AG_BONE
    text(
        lines, start, hit_end, x, y, wrapped, size=size, color=color, align=4,
        impact=True, spacing=0.3, move_from=(x - width * 0.035, y)
    )


def _full_ink(lines: list[str], start: float, end: float, width: int, height: int) -> None:
    rect(lines, start, end, 0, 0, width, height, AG_BLACK, layer=21)


def _field_wipe(lines: list[str], start: float, end: float, width: int, height: int) -> None:
    if end <= start:
        return
    # A vertical crimson field traverses the frame. It becomes the transition,
    # not decoration placed through readable type.
    sweep_w = width * 0.46
    moving_rect(lines, start, end, -sweep_w, 0, width + sweep_w * 0.15, 0, sweep_w, height, AG_RED, layer=36, move_ms=max(120, int((end - start) * 1000)))
    moving_rect(lines, start + min(0.05, (end - start) * 0.25), end, -sweep_w * 0.18, 0, width + sweep_w, 0, max(8, width * 0.018), height, AG_BONE, layer=37, move_ms=max(110, int((end - start) * 900)))


def _card_index(lines: list[str], start: float, end: float, width: int, height: int, value: str = "01") -> None:
    portrait = height > width
    text(lines, start, end, width * 0.93, height * 0.10, value, size=34 if portrait else 25, color=AG_GRAY, align=6, font=BODY_FONT, bold=True, spacing=2.0, layer=27)


def render_impact(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, wipe_start, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_ink(lines, wipe_start, card_end, width, height)
    _field_wipe(lines, wipe_start, card_start + 0.06, width, height)
    _utility_label(lines, card_start, card_end, width, height, "AG / STATEMENT")
    _card_index(lines, card_start, card_end, width, height)
    portrait = height > width
    wrapped = wrap_copy(title.upper(), 14 if portrait else 20, 3)
    size = fit_size(wrapped, int(width * 0.70), portrait=portrait, max_size=230 if portrait else 192, min_size=86 if portrait else 74)
    x = width * (0.075 if portrait else 0.07)
    y = height * (0.48 if body else 0.54)
    text(lines, card_start, card_end, x, y, wrapped, size=size, color=AG_BONE, align=4, impact=True, move_from=(x - width * 0.025, y))
    if body:
        body_copy = wrap_copy(body.upper(), 28 if portrait else 42, 2)
        body_size = fit_size(body_copy, int(width * 0.62), portrait=portrait, max_size=86 if portrait else 66, min_size=42 if portrait else 36)
        text(lines, card_start + 0.10, card_end, x, height * 0.76, body_copy, size=body_size, color=AG_RED, align=4, font=BODY_FONT, bold=True, spacing=0.4, delay=0.04)


def render_split(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body")) or clean(cue.get("reference"))
    hit_end, wipe_start, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_ink(lines, wipe_start, card_end, width, height)
    _field_wipe(lines, wipe_start, card_start + 0.05, width, height)
    portrait = height > width
    if portrait:
        field_y = height * 0.58
        rect(lines, card_start, card_end, 0, field_y, width, height - field_y, AG_RED, layer=23)
        left_x, left_y = width * 0.08, height * 0.36
        right_x, right_y = width * 0.08, height * 0.76
    else:
        field_x = width * 0.57
        rect(lines, card_start, card_end, field_x, 0, width - field_x, height, AG_RED, layer=23)
        left_x, left_y = width * 0.065, height * 0.53
        right_x, right_y = field_x + width * 0.035, height * 0.53
    _utility_label(lines, card_start, card_end, width, height, "AG / CONTRAST")
    title_copy = wrap_copy(title.upper(), 13 if portrait else 17, 3)
    title_size = fit_size(title_copy, int(width * (0.76 if portrait else 0.46)), portrait=portrait, max_size=190 if portrait else 148, min_size=76 if portrait else 62)
    text(lines, card_start, card_end, left_x, left_y, title_copy, size=title_size, color=AG_BONE, align=4, impact=True, move_from=(left_x - width * 0.025, left_y))
    if body:
        body_copy = wrap_copy(body.upper(), 13 if portrait else 16, 3)
        body_size = fit_size(body_copy, int(width * (0.76 if portrait else 0.34)), portrait=portrait, max_size=184 if portrait else 126, min_size=68 if portrait else 54)
        text(lines, card_start + 0.08, card_end, right_x, right_y, body_copy, size=body_size, color=AG_BONE, align=4, impact=True, move_from=(right_x + width * 0.025, right_y))


def render_strike(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    # Legacy compatibility only. The crossed-out visual language was removed.
    render_impact(lines, cue, start, end, width, height)


def render_band(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, wipe_start, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title, accent=True)
    _full_ink(lines, wipe_start, card_end, width, height)
    _field_wipe(lines, wipe_start, card_start + 0.04, width, height)
    portrait = height > width
    band_h = height * (0.19 if portrait else 0.28)
    band_y = height * (0.40 if portrait else 0.37)
    moving_rect(lines, card_start, card_end, -width * 0.10, band_y, 0, band_y, width * 1.10, band_h, AG_BONE, layer=24, move_ms=300)
    title_copy = wrap_copy(title.upper(), 15 if portrait else 26, 2)
    size = fit_size(title_copy, int(width * 0.82), portrait=portrait, max_size=198 if portrait else 164, min_size=82 if portrait else 68)
    text(lines, card_start + 0.07, card_end, width * 0.07, band_y + band_h * 0.52, title_copy, size=size, color=AG_BLACK, align=4, impact=True, move_from=(width * 0.03, band_y + band_h * 0.52))
    if body:
        body_copy = wrap_copy(body.upper(), 30 if portrait else 48, 2)
        text(lines, card_start + 0.18, card_end, width * 0.07, height * 0.76, body_copy, size=52 if portrait else 38, color=AG_RED, align=4, font=BODY_FONT, spacing=1.0)


def render_stack(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    support = split_support_lines(cue.get("body") or "", 4)
    hit_end, wipe_start, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title, accent=True)
    _full_ink(lines, wipe_start, card_end, width, height)
    _field_wipe(lines, wipe_start, card_start + 0.04, width, height)
    _utility_label(lines, card_start, card_end, width, height, "AG / BUILD")
    portrait = height > width
    title_copy = wrap_copy(title.upper(), 14 if portrait else 18, 2)
    title_size = fit_size(title_copy, int(width * 0.76), portrait=portrait, max_size=208 if portrait else 174, min_size=84 if portrait else 72)
    title_x = width * (0.08 if portrait else 0.07)
    title_y = height * (0.32 if support else 0.53)
    text(lines, card_start, card_end, title_x, title_y, title_copy, size=title_size, color=AG_RED, align=4, impact=True, move_from=(title_x - width * 0.025, title_y))
    if not support:
        return

    count = len(support)
    top = 0.58 if count <= 2 else 0.54
    gap = 0.125 if count <= 2 else (0.105 if count == 3 else 0.088)
    for index, line in enumerate(support):
        line_copy = wrap_copy(line.upper(), 27 if portrait else 38, 2)
        line_size = fit_size(line_copy, int(width * 0.70), portrait=portrait, max_size=84 if portrait else 64, min_size=44 if portrait else 36)
        stagger = width * (0.025 * (index % 2))
        x = title_x + stagger
        y = height * (top + index * gap)
        text(lines, card_start + 0.08, card_end, x, y, line_copy, size=line_size, color=AG_BONE, align=4, font=HEADLINE_FONT, impact=True, delay=index * 0.07, move_from=(x - width * 0.025, y))


def render_question_stack(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    questions = split_questions(cue.get("body") or "")
    hit_end, wipe_start, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_ink(lines, wipe_start, card_end, width, height)
    _field_wipe(lines, wipe_start, card_start + 0.04, width, height)
    portrait = height > width
    # Oversized punctuation is a background field, not a decorative line through copy.
    text(lines, card_start, card_end, width * 0.94, height * 0.55, "?", size=int(height * 0.72), color=AG_RED, align=6, alpha="78", impact=False, layer=23)
    _utility_label(lines, card_start, card_end, width, height, "AG / QUESTION")
    title_copy = wrap_copy(title.upper(), 17 if portrait else 24, 2)
    title_size = fit_size(title_copy, int(width * 0.68), portrait=portrait, max_size=146 if portrait else 118, min_size=62 if portrait else 50)
    x = width * (0.08 if portrait else 0.07)
    text(lines, card_start, card_end, x, height * 0.29, title_copy, size=title_size, color=AG_BONE, align=4, impact=True, move_from=(x - width * 0.025, height * 0.29))
    if not questions:
        questions = [title]
    top = 0.53 if len(questions) <= 2 else 0.49
    gap = 0.17 if len(questions) <= 2 else 0.14
    for index, question in enumerate(questions[:3]):
        qcopy = wrap_copy(question.upper(), 22 if portrait else 33, 2)
        qsize = fit_size(qcopy, int(width * 0.66), portrait=portrait, max_size=96 if portrait else 76, min_size=48 if portrait else 40)
        color = AG_RED if index == len(questions[:3]) - 1 else AG_BONE
        y = height * (top + index * gap)
        text(lines, card_start + 0.08, card_end, x + width * (0.018 * index), y, qcopy, size=qsize, color=color, align=4, impact=True, delay=index * 0.09, move_from=(x - width * 0.02, y))


def render_kinetic(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    if end - start < 0.45:
        return
    treatment = clean(cue.get("treatment")) or "impact"
    if treatment == "split":
        render_split(lines, cue, start, end, width, height)
    elif treatment == "strike":
        render_strike(lines, cue, start, end, width, height)
    elif treatment == "band":
        render_band(lines, cue, start, end, width, height)
    elif treatment == "stack":
        render_stack(lines, cue, start, end, width, height)
    elif treatment == "question-stack":
        render_question_stack(lines, cue, start, end, width, height)
    else:
        render_impact(lines, cue, start, end, width, height)


def append_kinetic_graphics(manifest: dict, target: str) -> int:
    """Append kinetic ASS events and return the number of visible rendered ranges."""
    plan = manifest.get("renderPlan") or {}
    output = plan.get("output") or {}
    width = int(output.get("width") or 1920)
    height = int(output.get("height") or 1080)
    lines: list[str] = []
    count = 0
    for cue in plan.get("overlays") or []:
        if cue.get("kind") != "kinetic" or not clean(cue.get("title")):
            continue
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart") or 0)
            end = float(visible.get("outputEnd") or start)
            if end <= start:
                continue
            render_kinetic(lines, cue, start, end, width, height)
            count += 1
    if lines:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
    return count
