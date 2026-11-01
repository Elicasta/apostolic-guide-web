#!/usr/bin/env python3
"""Apostolic Guide first-party broadcast graphics for Video Producer.

This module intentionally keeps design execution deterministic. The Edit Director
chooses semantic overlay kinds and timing; this renderer owns typography, scale,
color, layout and branding.
"""
import textwrap


# Broadcast Graphics System / 01 tokens derived from the approved AG design board.
NAVY = "2D1E0E"       # RGB #0E1E2D
RED = "2D21B3"        # RGB #B3212D
WARM = "F2F9FF"       # RGB #FFF9F2
CONCRETE = "DCD9D7"   # RGB #D7D9DC
CHARCOAL = "332F2C"   # RGB #2C2F33
WHITE = "FFFFFF"
BLACK = "000000"

HEADLINE_FONT = "Bebas Neue"
BODY_FONT = "Montserrat"
ACCENT_FONT = "Playfair Display"


def ass_time(seconds):
    seconds = max(0.0, float(seconds))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours}:{minutes:02d}:{secs:05.2f}"


def ass_escape(value):
    return str(value or "").replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def multiline(value, width, max_lines, upper=False):
    source = " ".join(str(value or "").strip().split())
    if upper:
        source = source.upper()
    if not source:
        return ""
    wrapped = textwrap.wrap(source, width=max(8, int(width)), break_long_words=False, break_on_hyphens=False)
    if len(wrapped) > max_lines:
        wrapped = wrapped[:max_lines]
        last = wrapped[-1].rstrip(" .,:;-")
        wrapped[-1] = last + "…"
    return "\\N".join(ass_escape(line) for line in wrapped)


def event(lines, start, end, style, text, layer=3):
    if end <= start or not text:
        return
    lines.append(f"Dialogue: {layer},{ass_time(start)},{ass_time(end)},{style},,0,0,0,,{text}")


def anim_tag(animation):
    if animation == "none":
        return ""
    if animation == "pop":
        return "{\\fad(70,120)\\fscx104\\fscy104\\t(0,160,\\fscx100\\fscy100)}"
    if animation in ("rise", "slide", "wipe"):
        return "{\\fad(90,140)}"
    return "{\\fad(110,150)}"


def add_rect(lines, start, end, x, y, width, height, color, alpha="00", layer=2, animation="fade"):
    x, y, width, height = int(x), int(y), max(1, int(width)), max(1, int(height))
    prefix = anim_tag(animation)
    drawing = (
        f"{prefix}{{\\an7\\pos({x},{y})\\p1\\bord0\\shad0\\1c&H{color}&\\1a&H{alpha}&}}"
        f"m 0 0 l {width} 0 l {width} {height} l 0 {height}"
        "{\\p0}"
    )
    event(lines, start, end, "Shape", drawing, layer=layer)


def add_text(
    lines, start, end, x, y, text, *, size, color=WARM, font=BODY_FONT,
    align=7, bold=False, italic=False, spacing=0, layer=5, animation="fade",
    outline=0, outline_color=NAVY
):
    if not text:
        return
    tags = [
        f"\\an{align}", f"\\pos({int(x)},{int(y)})", f"\\fn{font}", f"\\fs{int(size)}",
        f"\\c&H{color}&", f"\\b{1 if bold else 0}", f"\\i{1 if italic else 0}",
        f"\\fsp{float(spacing):g}", f"\\bord{float(outline):g}", f"\\3c&H{outline_color}&", "\\shad0"
    ]
    prefix = anim_tag(animation)
    event(lines, start, end, "Base", prefix + "{" + "".join(tags) + "}" + text, layer=layer)


def add_line(lines, start, end, x, y, width, thickness, color=RED, alpha="00", layer=4, animation="fade"):
    add_rect(lines, start, end, x, y, width, thickness, color, alpha=alpha, layer=layer, animation=animation)


def add_corner_marks(lines, start, end, x, y, width, height, color=NAVY, animation="fade"):
    length = max(20, int(min(width, height) * 0.07))
    thick = max(2, int(min(width, height) * 0.008))
    for px, py, sx, sy in [
        (x, y, 1, 1), (x + width, y, -1, 1), (x, y + height, 1, -1), (x + width, y + height, -1, -1)
    ]:
        hx = px if sx > 0 else px - length
        vy = py if sy > 0 else py - length
        add_rect(lines, start, end, hx, py, length, thick, color, layer=4, animation=animation)
        add_rect(lines, start, end, px, vy, thick, length, color, layer=4, animation=animation)


def dimensions(width, height):
    portrait = height > width
    return {
        "portrait": portrait,
        "safe_x": 54 if portrait else 72,
        "safe_y": 64 if portrait else 48,
        "headline": 92 if portrait else 72,
        "body": 42 if portrait else 32,
        "small": 28 if portrait else 22,
        "tiny": 22 if portrait else 18,
    }


def logo_tile(lines, start, end, x, y, size, animation="fade"):
    add_rect(lines, start, end, x, y, size, size, NAVY, layer=3, animation=animation)
    add_rect(lines, start, end, x + size * 0.55, y + size * 0.16, max(5, size * 0.06), size * 0.68, RED, layer=4, animation=animation)
    add_text(
        lines, start, end, x + size * 0.5, y + size * 0.53, "AG",
        size=size * 0.48, color=WARM, font=HEADLINE_FONT, align=5, bold=True,
        layer=5, animation=animation
    )


def render_brand_bug(lines, start, end, width, height):
    d = dimensions(width, height)
    x, y = d["safe_x"], d["safe_y"]
    h = 52 if d["portrait"] else 40
    w = 250 if d["portrait"] else 210
    add_rect(lines, start, end, x, y, w, h, NAVY, alpha="18", layer=1, animation="none")
    add_rect(lines, start, end, x, y, 7 if d["portrait"] else 5, h, RED, layer=2, animation="none")
    add_text(
        lines, start, end, x + 18, y + h * 0.53, "APOSTOLIC GUIDE",
        size=24 if d["portrait"] else 18, color=WARM, font=HEADLINE_FONT,
        align=4, bold=True, spacing=1.2, layer=3, animation="none"
    )


def render_lower_third(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    portrait = d["portrait"]
    panel_w = min(width - d["safe_x"] * 2, 930 if portrait else 930)
    panel_h = 210 if portrait else 150
    x = d["safe_x"]
    y = height - (440 if portrait else 215)
    tile = panel_h
    animation = cue.get("animation") or "slide"
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, layer=3, animation=animation)
    logo_tile(lines, start, end, x, y, tile, animation=animation)
    add_rect(lines, start, end, x + tile, y, 8 if portrait else 6, panel_h, RED, layer=4, animation=animation)
    add_rect(lines, start, end, x + panel_w - 28, y, 28, panel_h, NAVY, layer=4, animation=animation)
    add_rect(lines, start, end, x + panel_w - 28, y, 28, panel_h * 0.34, RED, layer=5, animation=animation)
    title = multiline(cue.get("title"), 26 if portrait else 30, 1, upper=True)
    role = multiline(cue.get("body") or cue.get("reference"), 38, 1, upper=True)
    tx = x + tile + (38 if portrait else 32)
    add_text(lines, start, end, tx, y + panel_h * 0.42, title, size=64 if portrait else 50, color=NAVY, font=HEADLINE_FONT, align=4, bold=True, animation=animation)
    if role:
        add_text(lines, start, end, tx, y + panel_h * 0.72, role, size=28 if portrait else 22, color=RED, font=BODY_FONT, align=4, bold=True, spacing=1.5, animation=animation)


def render_pathway_bug(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    portrait = d["portrait"]
    panel_w = min(width - d["safe_x"] * 2, 900 if portrait else 760)
    panel_h = 150 if portrait else 104
    x = d["safe_x"]
    y = height - (380 if portrait else 168)
    tile = panel_h
    animation = cue.get("animation") or "rise"
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, layer=3, animation=animation)
    logo_tile(lines, start, end, x, y, tile, animation=animation)
    add_rect(lines, start, end, x + panel_w - 24, y, 24, panel_h, RED, layer=4, animation=animation)
    title = multiline(cue.get("title"), 28, 1, upper=True)
    body = multiline(cue.get("body") or "FOLLOW ALONG THROUGH THE SCRIPTURES", 42, 1, upper=False)
    tx = x + tile + (30 if portrait else 24)
    add_text(lines, start, end, tx, y + panel_h * 0.40, title, size=48 if portrait else 38, color=NAVY, font=HEADLINE_FONT, align=4, bold=True, animation=animation)
    if body:
        add_text(lines, start, end, tx, y + panel_h * 0.72, body, size=24 if portrait else 18, color=CHARCOAL, font=BODY_FONT, align=4, animation=animation)


def render_scripture_lower(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    portrait = d["portrait"]
    x = d["safe_x"]
    y = height - (590 if portrait else 330)
    panel_w = width - d["safe_x"] * 2
    panel_h = 330 if portrait else 230
    ref_w = 245 if portrait else 255
    animation = cue.get("animation") or "fade"
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, layer=3, animation=animation)
    add_rect(lines, start, end, x, y, ref_w, panel_h, NAVY, layer=4, animation=animation)
    add_rect(lines, start, end, x + ref_w, y, 8, panel_h, RED, layer=5, animation=animation)
    reference = multiline(cue.get("reference") or cue.get("body") or "SCRIPTURE", 18, 3, upper=True)
    add_text(lines, start, end, x + 28, y + panel_h * 0.45, reference, size=34 if portrait else 26, color=WARM, font=HEADLINE_FONT, align=4, bold=True, spacing=1.2, animation=animation)
    verse = multiline(cue.get("title"), 24 if portrait else 34, 4, upper=True)
    add_text(lines, start, end, x + ref_w + 42, y + 34, verse, size=54 if portrait else 44, color=NAVY, font=HEADLINE_FONT, align=7, bold=True, animation=animation)
    body = cue.get("body") if cue.get("reference") else None
    if body and str(body).strip().lower() != str(cue.get("reference") or "").strip().lower():
        body_text = multiline(body, 50 if portrait else 64, 2, upper=False)
        add_text(lines, start, end, x + ref_w + 42, y + panel_h - 54, body_text, size=25 if portrait else 20, color=CHARCOAL, font=BODY_FONT, align=1, animation=animation)


def render_scripture_full(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    animation = cue.get("animation") or "fade"
    add_rect(lines, start, end, 0, 0, width, height, NAVY, alpha="04", layer=2, animation=animation)
    # restrained editorial frame and bookmark from Broadcast Graphics System / 01
    margin = 82 if d["portrait"] else 96
    add_corner_marks(lines, start, end, margin, margin, width - margin * 2, height - margin * 2, color=WARM, animation=animation)
    bookmark_w = 44 if d["portrait"] else 34
    bookmark_h = 78 if d["portrait"] else 58
    add_rect(lines, start, end, width / 2 - bookmark_w / 2, margin - 2, bookmark_w, bookmark_h, RED, layer=4, animation=animation)
    title_raw = str(cue.get("title") or "")
    title_size = (94 if d["portrait"] else 78)
    if len(title_raw) > 110:
        title_size -= 12
    verse = multiline(title_raw, 24 if d["portrait"] else 34, 5, upper=True)
    add_text(lines, start, end, width / 2, height * 0.47, verse, size=title_size, color=WARM, font=HEADLINE_FONT, align=5, bold=True, spacing=1.0, animation=animation)
    add_line(lines, start, end, width / 2 - (90 if d["portrait"] else 70), height * 0.68, 180 if d["portrait"] else 140, 5, RED, animation=animation)
    reference = multiline(cue.get("reference") or cue.get("body") or "SCRIPTURE", 34, 1, upper=True)
    add_text(lines, start, end, width / 2, height * 0.75, reference, size=34 if d["portrait"] else 28, color=WARM, font=BODY_FONT, align=5, bold=True, spacing=2, animation=animation)


def render_statement(lines, cue, start, end, width, height, number):
    d = dimensions(width, height)
    portrait = d["portrait"]
    animation = cue.get("animation") or "pop"
    panel_w = width - d["safe_x"] * 2
    panel_h = 340 if portrait else 245
    x = d["safe_x"]
    y = height * (0.39 if portrait else 0.54)
    number_w = 220 if portrait else 210
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, layer=3, animation=animation)
    add_rect(lines, start, end, x, y, number_w, panel_h, NAVY, layer=4, animation=animation)
    add_rect(lines, start, end, x + number_w * 0.54, y, 44 if portrait else 34, 64 if portrait else 52, RED, layer=5, animation=animation)
    add_text(lines, start, end, x + number_w * 0.5, y + panel_h * 0.56, f"{number:02d}", size=112 if portrait else 92, color=WARM, font=HEADLINE_FONT, align=5, bold=True, animation=animation)
    title = multiline(cue.get("title"), 22 if portrait else 34, 3, upper=True)
    add_text(lines, start, end, x + number_w + 46, y + 42, title, size=62 if portrait else 50, color=NAVY, font=HEADLINE_FONT, align=7, bold=True, animation=animation)
    if cue.get("body"):
        body = multiline(cue.get("body"), 46 if portrait else 66, 2, upper=False)
        add_text(lines, start, end, x + number_w + 46, y + panel_h - 46, body, size=27 if portrait else 21, color=CHARCOAL, font=BODY_FONT, align=1, animation=animation)
    add_line(lines, start, end, x + number_w + 46, y + panel_h - 18, 95, 4, RED, animation=animation)


def render_quote(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    portrait = d["portrait"]
    animation = cue.get("animation") or "fade"
    x = d["safe_x"]
    panel_w = width - d["safe_x"] * 2
    panel_h = 500 if portrait else 390
    y = height / 2 - panel_h / 2
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, alpha="04", layer=3, animation=animation)
    add_corner_marks(lines, start, end, x + 28, y + 28, panel_w - 56, panel_h - 56, color=NAVY, animation=animation)
    quote = multiline(cue.get("title"), 21 if portrait else 30, 5, upper=False)
    add_text(lines, start, end, width / 2, y + panel_h * 0.47, quote, size=72 if portrait else 60, color=NAVY, font=ACCENT_FONT, align=5, italic=True, animation=animation)
    add_line(lines, start, end, width / 2 - 70, y + panel_h * 0.73, 140, 4, RED, animation=animation)
    if cue.get("body") or cue.get("reference"):
        attribution = multiline(cue.get("body") or cue.get("reference"), 45, 1, upper=True)
        add_text(lines, start, end, width / 2, y + panel_h * 0.84, attribution, size=25 if portrait else 20, color=CHARCOAL, font=BODY_FONT, align=5, bold=True, spacing=1.5, animation=animation)


def render_chapter(lines, cue, start, end, width, height, number):
    d = dimensions(width, height)
    animation = cue.get("animation") or "wipe"
    add_rect(lines, start, end, 0, 0, width, height, NAVY, alpha="02", layer=2, animation=animation)
    title = multiline(cue.get("title"), 22 if d["portrait"] else 28, 3, upper=True)
    add_text(lines, start, end, width / 2, height * 0.37, f"CHAPTER {number:02d}", size=32 if d["portrait"] else 26, color=WARM, font=BODY_FONT, align=5, bold=True, spacing=4, animation=animation)
    add_text(lines, start, end, width / 2, height * 0.53, title, size=112 if d["portrait"] else 92, color=WARM, font=HEADLINE_FONT, align=5, bold=True, spacing=1.5, animation=animation)
    add_line(lines, start, end, width / 2 - 105, height * 0.67, 210, 5, RED, animation=animation)
    if cue.get("body"):
        body = multiline(cue.get("body"), 52 if d["portrait"] else 72, 2, upper=False)
        add_text(lines, start, end, width / 2, height * 0.77, body, size=30 if d["portrait"] else 24, color=CONCRETE, font=BODY_FONT, align=5, animation=animation)


def render_cta(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    portrait = d["portrait"]
    x = d["safe_x"]
    panel_w = width - d["safe_x"] * 2
    panel_h = 170 if portrait else 116
    y = height - (430 if portrait else 180)
    animation = cue.get("animation") or "slide"
    add_rect(lines, start, end, x, y, panel_w, panel_h, WARM, layer=3, animation=animation)
    logo_tile(lines, start, end, x, y, panel_h, animation=animation)
    add_rect(lines, start, end, x + panel_w - 70, y, 70, panel_h, RED, layer=4, animation=animation)
    title = multiline(cue.get("title"), 30, 1, upper=True)
    body = multiline(cue.get("body") or cue.get("reference"), 55, 1, upper=False)
    tx = x + panel_h + 32
    add_text(lines, start, end, tx, y + panel_h * 0.40, title, size=48 if portrait else 38, color=NAVY, font=HEADLINE_FONT, align=4, bold=True, animation=animation)
    if body:
        add_text(lines, start, end, tx, y + panel_h * 0.72, body, size=25 if portrait else 19, color=CHARCOAL, font=BODY_FONT, align=4, animation=animation)
    add_text(lines, start, end, x + panel_w - 35, y + panel_h * 0.52, "›", size=64 if portrait else 48, color=WARM, font=BODY_FONT, align=5, bold=True, animation=animation)


def render_generic_overlay(lines, cue, start, end, width, height):
    d = dimensions(width, height)
    title = multiline(cue.get("title"), 24 if d["portrait"] else 34, 3, upper=True)
    body = multiline(cue.get("body") or cue.get("reference"), 42 if d["portrait"] else 56, 2, upper=False)
    x = width / 2
    y = height * 0.5
    animation = cue.get("animation") or "fade"
    panel_w = width - d["safe_x"] * 2
    panel_h = 360 if d["portrait"] else 250
    add_rect(lines, start, end, d["safe_x"], y - panel_h / 2, panel_w, panel_h, NAVY, alpha="18", layer=3, animation=animation)
    add_text(lines, start, end, x, y - 28, title, size=76 if d["portrait"] else 60, color=WARM, font=HEADLINE_FONT, align=5, bold=True, animation=animation)
    if body:
        add_text(lines, start, end, x, y + 84, body, size=30 if d["portrait"] else 24, color=CONCRETE, font=BODY_FONT, align=5, animation=animation)


def render_overlay(lines, cue, start, end, width, height, ordinal):
    kind = cue.get("kind") or "statement"
    placement = cue.get("placement") or "lower-third"
    if kind == "lower-third":
        return render_lower_third(lines, cue, start, end, width, height)
    if kind == "pathway":
        return render_pathway_bug(lines, cue, start, end, width, height)
    if kind == "scripture":
        if placement in ("full-frame", "center"):
            return render_scripture_full(lines, cue, start, end, width, height)
        return render_scripture_lower(lines, cue, start, end, width, height)
    if kind == "chapter":
        return render_chapter(lines, cue, start, end, width, height, ordinal)
    if kind == "statement":
        return render_statement(lines, cue, start, end, width, height, ordinal)
    if kind == "quote":
        return render_quote(lines, cue, start, end, width, height)
    if kind == "cta":
        return render_cta(lines, cue, start, end, width, height)
    return render_generic_overlay(lines, cue, start, end, width, height)


def caption_markup(group, active_index, style, highlight):
    parts = []
    for index, word in enumerate(group):
        value = ass_escape(word["word"])
        if highlight and index == active_index:
            if style == "word-pop":
                value = "{\\c&H" + RED + "&\\fscx116\\fscy116}" + value + "{\\rCaption}"
            else:
                value = "{\\c&H" + RED + "&}" + value + "{\\rCaption}"
        parts.append(value)
    return " ".join(parts)


def map_word_to_output(word, keep_segments):
    start = float(word.get("start", 0))
    end = float(word.get("end", start))
    midpoint = (start + end) / 2
    cursor = 0.0
    for index, segment in enumerate(keep_segments):
        seg_start = float(segment["start"])
        seg_end = float(segment["end"])
        is_last = index == len(keep_segments) - 1
        if seg_start <= midpoint < seg_end or (is_last and midpoint == seg_end):
            mapped_start = cursor + max(0.0, start - seg_start)
            mapped_end = cursor + min(seg_end - seg_start, max(0.02, end - seg_start))
            if mapped_end <= mapped_start:
                mapped_end = mapped_start + 0.04
            return {"word": str(word.get("word") or "").strip(), "start": mapped_start, "end": mapped_end}
        cursor += seg_end - seg_start
    return None


def caption_groups(words, max_words):
    groups = []
    current = []
    for word in words:
        if not word["word"]:
            continue
        if current and (len(current) >= max_words or word["start"] - current[-1]["end"] > 0.8 or word["end"] - current[0]["start"] > 3.2):
            groups.append(current)
            current = []
        current.append(word)
    if current:
        groups.append(current)
    return groups


def build_broadcast_ass(manifest, target):
    plan = manifest["renderPlan"]
    output = plan["output"]
    width, height = int(output["width"]), int(output["height"])
    portrait = height > width
    captions = plan.get("captions") or {}

    # Broadcast-sized typography. The previous 34px 1080p overlay scale was web-sized
    # and unreadable in the rendered master.
    caption_size = 94 if portrait else 56
    if captions.get("style") == "editorial":
        caption_size = 108 if portrait else 64
    elif captions.get("style") == "minimal":
        caption_size = 80 if portrait else 48
    margin_v = 300 if portrait else 115

    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
        f"Style: Base,{BODY_FONT},42,&H00{WARM},&H00{WARM},&H00{NAVY},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
        f"Style: Shape,{BODY_FONT},10,&H00{WARM},&H00{WARM},&H00{NAVY},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
        f"Style: Caption,{BODY_FONT},{caption_size},&H00{WARM},&H00{WARM},&H00{NAVY},&H76000000,-1,0,0,0,100,100,0,0,1,{7 if portrait else 5},1,2,70,70,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]

    if captions.get("enabled"):
        mapped = []
        for word in (manifest.get("transcript") or {}).get("words") or []:
            item = map_word_to_output(word, plan.get("keepSegments") or [])
            if item:
                mapped.append(item)
        max_words = max(2, min(10, int(captions.get("maxWordsPerCard") or 5)))
        style = captions.get("style") or "kinetic-clean"
        highlight = bool(captions.get("highlightCurrentWord"))
        animation = captions.get("animation") or "none"
        for group in caption_groups(mapped, max_words):
            for index, word in enumerate(group):
                cstart = word["start"]
                cend = group[index + 1]["start"] if index + 1 < len(group) else max(word["end"], cstart + 0.18)
                animation_tag = "{\\fad(60,70)}" if animation in ("rise", "pop", "highlight") else ""
                text = animation_tag + caption_markup(group, index, style, highlight)
                event(lines, cstart, cend, "Caption", text, layer=8)

    output_duration = float(plan.get("outputDuration") or 0)
    if output_duration > 0:
        render_brand_bug(lines, 0, output_duration, width, height)

    ordinal = 0
    for cue in plan.get("overlays") or []:
        if not str(cue.get("title") or "").strip():
            continue
        ordinal += 1
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart", 0))
            end = float(visible.get("outputEnd", start))
            if end > start:
                render_overlay(lines, cue, start, end, width, height, ordinal)

    with open(target, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
