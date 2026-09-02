#!/usr/bin/env python3
"""Apostolic Guide Kinetic Graphics / 01.

Deterministic long-form motion typography inspired by premium editorial YouTube
pacing without copying another creator's branding. Sol chooses semantic text and
one treatment. This renderer owns the Apostolic Guide palette, type scale,
transition timing, slashes, bands, washes, and full-frame graphic resolution.

Kinetic overlays are intentionally authored punctuation, not captions. Each cue
starts as a text hit over A-roll, then resolves into a graphic treatment before
returning to the speaker.
"""
from __future__ import annotations

# Canonical Apostolic Guide site tokens from app/globals.css.
# ASS uses BGR byte order, so the stored values below are reversed RGB bytes.
AG_RED = "3D2DA1"       # RGB #A12D3D -- var(--crimson)
AG_BONE = "F4F7F5"      # RGB #F5F7F4 -- var(--paper)
AG_BLACK = "2A2010"     # RGB #10202A -- var(--ink)
AG_GRAY = "7D7766"      # RGB #66777D -- var(--muted)
AG_CHARCOAL = "443A26"  # RGB #263A44 -- var(--ink-2)

HEADLINE_FONT = "Bebas Neue"
BODY_FONT = "Montserrat"


def ass_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def esc(value) -> str:
    return str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def clean(value) -> str:
    return " ".join(str(value or "").strip().split())


def event(lines: list[str], start: float, end: float, text_value: str, *, layer: int = 20, style: str = "Base") -> None:
    if end <= start or not text_value:
        return
    lines.append(f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text_value}")


def rect(
    lines: list[str], start: float, end: float, x: float, y: float, width: float, height: float,
    color: str, *, alpha: str = "00", layer: int = 20, fade: bool = True, angle: float = 0
) -> None:
    prefix = "{\\fad(70,100)}" if fade else ""
    drawing = (
        f"{prefix}{{\\an7\\pos({int(x)},{int(y)})\\frz{float(angle):g}\\p1\\bord0\\shad0"
        f"\\1c&H{color}&\\1a&H{alpha}&}}"
        f"m 0 0 l {max(1, int(width))} 0 l {max(1, int(width))} {max(1, int(height))} l 0 {max(1, int(height))}"
        "{\\p0}"
    )
    event(lines, start, end, drawing, layer=layer, style="Shape")


def moving_rect(
    lines: list[str], start: float, end: float, from_x: float, from_y: float, to_x: float, to_y: float,
    width: float, height: float, color: str, *, layer: int = 26, angle: float = 0, move_ms: int = 380
) -> None:
    duration_ms = max(1, int((end - start) * 1000))
    move_ms = min(move_ms, duration_ms)
    drawing = (
        f"{{\\an7\\move({int(from_x)},{int(from_y)},{int(to_x)},{int(to_y)},0,{move_ms})"
        f"\\frz{float(angle):g}\\p1\\bord0\\shad0\\1c&H{color}&}}"
        f"m 0 0 l {max(1, int(width))} 0 l {max(1, int(width))} {max(1, int(height))} l 0 {max(1, int(height))}"
        "{\\p0}"
    )
    event(lines, start, end, drawing, layer=layer, style="Shape")


def text(
    lines: list[str], start: float, end: float, x: float, y: float, value: str, *, size: float,
    color: str = AG_BONE, align: int = 5, font: str = HEADLINE_FONT, layer: int = 28,
    bold: bool = True, spacing: float = 0, impact: bool = False, delay: float = 0,
    outline: float = 0, outline_color: str = AG_BLACK
) -> None:
    value = clean(value)
    if not value:
        return
    start = start + max(0.0, delay)
    if end <= start:
        return
    if impact:
        intro = "\\fad(45,90)\\fscx112\\fscy112\\t(0,190,\\fscx100\\fscy100)"
    else:
        intro = "\\fad(65,100)"
    tags = (
        f"{{\\an{align}\\pos({int(x)},{int(y)})\\fn{font}\\fs{int(size)}\\c&H{color}&"
        f"\\b{1 if bold else 0}\\fsp{float(spacing):g}\\bord{float(outline):g}\\3c&H{outline_color}&\\shad0{intro}}}"
    )
    event(lines, start, end, tags + esc(value), layer=layer)


def fit_size(value: str, width: int, *, portrait: bool, max_size: int, min_size: int) -> int:
    chars = max(1, len(clean(value)))
    # Bebas Neue is narrow. This keeps short phrases huge and prevents long
    # doctrinal lines from silently shrinking into unreadable body copy.
    ratio = 0.52 if portrait else 0.48
    estimated = int(width / max(1.0, chars * ratio))
    return max(min_size, min(max_size, estimated))


def split_questions(body: str) -> list[str]:
    raw = clean(body)
    if not raw:
        return []
    if "|" in raw:
        return [clean(item) for item in raw.split("|") if clean(item)][:3]
    chunks = [clean(item) for item in raw.replace("? ", "?| ").split("|") if clean(item)]
    return chunks[:3]


def _phase_times(start: float, end: float) -> tuple[float, float, float]:
    duration = max(0.5, end - start)
    hit = min(1.35, max(0.72, duration * 0.36))
    hit_end = min(end, start + hit)
    card_start = min(end, max(start + 0.58, hit_end - 0.12))
    return hit_end, card_start, end


def _a_roll_hit(lines: list[str], start: float, hit_end: float, width: int, height: int, title: str, *, accent: bool = False) -> None:
    portrait = height > width
    # Ink wash keeps the speaker visible while establishing AG contrast.
    rect(lines, start, hit_end, 0, 0, width, height, AG_BLACK, alpha="68", layer=18, fade=True)
    max_width = int(width * (0.86 if portrait else 0.82))
    size = fit_size(title, max_width, portrait=portrait, max_size=210 if portrait else 176, min_size=82 if portrait else 74)
    color = AG_RED if accent else AG_BONE
    text(lines, start, hit_end, width / 2, height * (0.55 if portrait else 0.58), title.upper(), size=size, color=color, impact=True, spacing=1.0)


def _full_black(lines: list[str], start: float, end: float, width: int, height: int) -> None:
    rect(lines, start, end, 0, 0, width, height, AG_BLACK, alpha="00", layer=21, fade=True)


def _accent_slash(lines: list[str], start: float, end: float, width: int, height: int, *, crossed: bool = False) -> None:
    y = height * (0.68 if crossed else 0.78)
    moving_rect(lines, start, end, -width * 0.35, y, width * 0.06, y - height * 0.08, width * 1.35, 18 if height < width else 24, AG_RED, layer=31, angle=-8 if crossed else -5)
    if crossed:
        moving_rect(lines, start + 0.10, end, width * 0.48, height * 0.18, width * 0.15, height * 0.28, width * 1.0, 15 if height < width else 20, AG_RED, layer=31, angle=28)


def _underline_scribble(lines: list[str], start: float, end: float, width: int, height: int, y: float) -> None:
    base_x = width * 0.36
    for index, angle in enumerate((-2.5, 1.6, -1.0)):
        moving_rect(
            lines, start + index * 0.05, end, base_x - width * 0.10, y + index * 7,
            base_x, y + index * 7, width * 0.31, 5 if height < width else 7,
            AG_BONE, layer=32, angle=angle, move_ms=250
        )


def render_impact(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_black(lines, card_start, card_end, width, height)
    portrait = height > width
    size = fit_size(title, int(width * 0.84), portrait=portrait, max_size=196 if portrait else 168, min_size=80 if portrait else 72)
    text(lines, card_start, card_end, width / 2, height * (0.47 if body else 0.53), title.upper(), size=size, color=AG_BONE, impact=True, spacing=1.0)
    if body:
        body_size = fit_size(body, int(width * 0.80), portrait=portrait, max_size=126 if portrait else 104, min_size=56 if portrait else 50)
        text(lines, card_start + 0.12, card_end, width / 2, height * 0.66, body.upper(), size=body_size, color=AG_RED, impact=True, spacing=0.8)
    _accent_slash(lines, card_start + 0.12, card_end, width, height)


def render_split(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body")) or clean(cue.get("reference"))
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_black(lines, card_start, card_end, width, height)
    portrait = height > width
    title_size = fit_size(title, int(width * 0.78), portrait=portrait, max_size=174 if portrait else 146, min_size=72 if portrait else 68)
    text(lines, card_start, card_end, width / 2, height * 0.40, title.upper(), size=title_size, color=AG_BONE, impact=True)
    if body:
        body_size = fit_size(body, int(width * 0.86), portrait=portrait, max_size=196 if portrait else 160, min_size=72 if portrait else 66)
        text(lines, card_start + 0.10, card_end, width / 2, height * 0.61, body.upper(), size=body_size, color=AG_RED, impact=True)
    _accent_slash(lines, card_start + 0.16, card_end, width, height)


def render_strike(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_black(lines, card_start, card_end, width, height)
    portrait = height > width
    size = fit_size(title, int(width * 0.72), portrait=portrait, max_size=250 if portrait else 228, min_size=110 if portrait else 104)
    text(lines, card_start, card_end, width / 2, height * 0.50, title.upper(), size=size, color=AG_BONE, impact=True, spacing=1.0)
    _accent_slash(lines, card_start + 0.06, card_end, width, height, crossed=True)
    if body:
        text(lines, card_start + 0.22, card_end, width / 2, height * 0.76, body.upper(), size=58 if portrait else 46, color=AG_RED, impact=False, spacing=1.8)


def render_band(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title, accent=True)
    _full_black(lines, card_start, card_end, width, height)
    band_h = height * (0.22 if height < width else 0.16)
    band_y = height * 0.43
    moving_rect(lines, card_start, card_end, -width * 0.15, band_y, 0, band_y, width * 1.15, band_h, AG_BONE, layer=24, move_ms=340)
    portrait = height > width
    size = fit_size(title, int(width * 0.76), portrait=portrait, max_size=192 if portrait else 156, min_size=78 if portrait else 70)
    text(lines, card_start + 0.08, card_end, width / 2, band_y + band_h * 0.53, title.upper(), size=size, color=AG_BLACK, impact=True)
    if body:
        text(lines, card_start + 0.20, card_end, width / 2, height * 0.73, body.upper(), size=58 if portrait else 44, color=AG_RED, spacing=1.4)


def render_stack(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    body = clean(cue.get("body"))
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title, accent=True)
    _full_black(lines, card_start, card_end, width, height)
    portrait = height > width
    title_size = fit_size(title, int(width * 0.92), portrait=portrait, max_size=220 if portrait else 194, min_size=94 if portrait else 84)
    text(lines, card_start, card_end, width / 2, height * 0.38, title.upper(), size=title_size, color=AG_RED, impact=True)
    if body:
        body_size = fit_size(body, int(width * 0.72), portrait=portrait, max_size=134 if portrait else 108, min_size=62 if portrait else 56)
        text(lines, card_start + 0.12, card_end, width / 2, height * 0.61, body.upper(), size=body_size, color=AG_BONE, impact=True)
        _underline_scribble(lines, card_start + 0.20, card_end, width, height, height * 0.70)
    else:
        _underline_scribble(lines, card_start + 0.20, card_end, width, height, height * 0.59)


def render_question_stack(lines: list[str], cue: dict, start: float, end: float, width: int, height: int) -> None:
    title = clean(cue.get("title"))
    questions = split_questions(cue.get("body") or "")
    hit_end, card_start, card_end = _phase_times(start, end)
    _a_roll_hit(lines, start, hit_end, width, height, title)
    _full_black(lines, card_start, card_end, width, height)
    portrait = height > width
    title_size = fit_size(title, int(width * 0.82), portrait=portrait, max_size=132 if portrait else 102, min_size=60 if portrait else 52)
    text(lines, card_start, card_end, width / 2, height * 0.23, title.upper(), size=title_size, color=AG_BONE, impact=True)
    if not questions:
        questions = [title]
    top = 0.48 if len(questions) <= 2 else 0.43
    gap = 0.18 if len(questions) <= 2 else 0.17
    for index, question in enumerate(questions):
        color = AG_RED if index == len(questions) - 1 else AG_BONE
        qsize = fit_size(question, int(width * 0.78), portrait=portrait, max_size=112 if portrait else 86, min_size=52 if portrait else 46)
        text(lines, card_start, card_end, width / 2, height * (top + index * gap), question.upper(), size=qsize, color=color, impact=True, delay=index * 0.12)


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
