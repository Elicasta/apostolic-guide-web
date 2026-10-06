#!/usr/bin/env python3
"""Apostolic Guide Broadcast Graphics System / 03.

Editorial, pathway-aware graphics for long-form teaching. V3 removes persistent
corner bugs and white corporate cards. Orientation appears briefly after genuine
section changes; Scripture and Pathway beats use the canonical AG ink, crimson,
paper and muted palette with strong broadcast scale.
"""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V1_PATH = os.path.join(ROOT, "scripts", "video_producer_broadcast_graphics.py")
SPEC = importlib.util.spec_from_file_location("ag_broadcast_v1", V1_PATH)
g = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(g)

# Canonical app/globals.css tokens in ASS BGR order.
g.NAVY = "2A2010"       # #10202A ink
g.RED = "3D2DA1"        # #A12D3D crimson
g.WARM = "F4F7F5"       # #F5F7F4 paper
g.CONCRETE = "7D7766"   # #66777D muted
g.CHARCOAL = "443A26"   # #263A44 ink-2


def _clean(value):
    return " ".join(str(value or "").strip().split())


def _pathway(manifest):
    project = manifest.get("project") or {}
    value = project.get("pathway")
    return value if isinstance(value, dict) else None


def _step_number(cue, pathway, ordinal):
    if not pathway:
        return max(1, ordinal)
    reference = _clean(cue.get("reference")).lower()
    title = _clean(cue.get("title")).lower()
    steps = pathway.get("steps") or []
    for index, step in enumerate(steps):
        step_ref = _clean(step.get("reference")).lower()
        step_title = _clean(step.get("title")).lower()
        if reference and step_ref and reference == step_ref:
            return index + 1
        if title and step_title and (title == step_title or title in step_title or step_title in title):
            return index + 1
    return min(max(1, ordinal), max(1, len(steps))) if steps else max(1, ordinal)


def _step_title(pathway, number, fallback):
    steps = pathway.get("steps") or [] if pathway else []
    if 1 <= number <= len(steps):
        return _clean(steps[number - 1].get("title")) or fallback
    return fallback


def _step_reference(pathway, number):
    steps = pathway.get("steps") or [] if pathway else []
    if 1 <= number <= len(steps):
        return _clean(steps[number - 1].get("reference"))
    return ""


def _utility(lines, start, end, x, y, label, portrait=False, color=None):
    g.add_rect(lines, start, end, x, y - (10 if portrait else 7), 7 if portrait else 5, 34 if portrait else 26, g.RED, layer=6, animation="fade")
    g.add_text(lines, start, end, x + (22 if portrait else 17), y, label.upper(), size=24 if portrait else 18, color=color or g.CONCRETE, font=g.BODY_FONT, align=4, bold=True, spacing=2.1, layer=7, animation="fade")


def render_orientation_strip(lines, start, end, width, height, pathway, stop_number, segment_title):
    """A short post-transition orientation cue. Never persistent."""
    if not pathway or end <= start:
        return
    portrait = height > width
    x = 64 if portrait else 76
    y = 142 if portrait else 92
    panel_w = min(width * .78, 650 if portrait else 720)
    panel_h = 126 if portrait else 92
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.NAVY, alpha="20", layer=3, animation="rise")
    g.add_rect(lines, start, end, x, y, 8 if portrait else 6, panel_h, g.RED, layer=4, animation="rise")
    label = f"{_clean(pathway.get('title')).upper()}  /  {stop_number:02d}"
    title = g.multiline(_clean(segment_title or _step_title(pathway, stop_number, "PATHWAY")), 26 if portrait else 38, 1, upper=True)
    g.add_text(lines, start, end, x + 28, y + panel_h * .30, label, size=23 if portrait else 17, color=g.CONCRETE, font=g.BODY_FONT, align=4, bold=True, spacing=2.0, layer=5, animation="rise")
    g.add_text(lines, start, end, x + 28, y + panel_h * .67, title, size=43 if portrait else 34, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, spacing=.35, layer=5, animation="rise")


def render_pathway_card(lines, cue, start, end, width, height, ordinal, pathway):
    portrait = height > width
    stop = _step_number(cue, pathway, ordinal)
    title = _clean(cue.get("title")) or _step_title(pathway, stop, "PATHWAY")
    body = _clean(cue.get("body")) or _clean(pathway.get("title") if pathway else "Apostolic Guide")
    reference = _clean(cue.get("reference")) or _step_reference(pathway, stop)
    animation = cue.get("animation") or "wipe"
    g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, layer=2, animation=animation)
    field_w = width * (.30 if not portrait else 1.0)
    field_h = height if not portrait else height * .28
    g.add_rect(lines, start, end, 0, 0, field_w, field_h, g.RED, layer=3, animation="wipe")
    if portrait:
        g.add_text(lines, start, end, width * .08, field_h * .55, f"{stop:02d}", size=190, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, layer=4, animation="rise")
        tx, ty = width * .08, height * .49
        max_chars = 22
    else:
        g.add_text(lines, start, end, field_w * .50, height * .51, f"{stop:02d}", size=280, color=g.WARM, font=g.HEADLINE_FONT, align=5, bold=True, layer=4, animation="rise")
        tx, ty = width * .36, height * .43
        max_chars = 28
    _utility(lines, start, end, tx, ty - height * .17, "AG / PATHWAY STOP", portrait)
    title_text = g.multiline(title, max_chars, 3, upper=True)
    g.add_text(lines, start, end, tx, ty, title_text, size=112 if portrait else 104, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, spacing=.3, layer=5, animation="rise")
    if body:
        body_text = g.multiline(body, 35 if portrait else 52, 2, upper=False)
        g.add_text(lines, start, end, tx, height * (.70 if portrait else .72), body_text, size=31 if portrait else 26, color=g.CONCRETE, font=g.BODY_FONT, align=4, bold=True, spacing=.2, layer=5, animation="fade")
    if reference:
        g.add_text(lines, start, end, tx, height * (.82 if portrait else .82), reference.upper(), size=28 if portrait else 22, color=g.RED if portrait else g.WARM, font=g.BODY_FONT, align=4, bold=True, spacing=2.0, layer=5, animation="fade")


def _scripture_needs_full_frame(cue, width, height):
    if cue.get("placement") in ("full-frame", "center"):
        return True
    text = _clean(cue.get("title"))
    threshold = 70 if height <= width else 52
    return len(text) > threshold


def render_scripture_lower(lines, cue, start, end, width, height):
    portrait = height > width
    x = width * (.06 if portrait else .055)
    panel_w = width * (.88 if portrait else .78)
    panel_h = height * (.29 if portrait else .27)
    y = height - panel_h - height * (.10 if portrait else .075)
    animation = cue.get("animation") or "rise"
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.NAVY, alpha="10", layer=3, animation=animation)
    g.add_rect(lines, start, end, x, y, 8 if portrait else 6, panel_h, g.RED, layer=4, animation=animation)
    reference = _clean(cue.get("reference")) or "SCRIPTURE"
    verse = g.multiline(_clean(cue.get("title")), 24 if portrait else 47, 3 if portrait else 2, upper=False)
    g.add_text(lines, start, end, x + 34, y + panel_h * .24, reference.upper(), size=28 if portrait else 22, color=g.RED, font=g.BODY_FONT, align=4, bold=True, spacing=2.0, layer=5, animation=animation)
    g.add_text(lines, start, end, x + 34, y + panel_h * .61, verse, size=61 if portrait else 51, color=g.WARM, font=g.BODY_FONT, align=4, bold=True, spacing=0, layer=5, animation=animation)


def render_scripture_full(lines, cue, start, end, width, height):
    portrait = height > width
    animation = cue.get("animation") or "fade"
    g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, layer=2, animation=animation)
    x = width * (.08 if portrait else .075)
    reference = _clean(cue.get("reference")) or "SCRIPTURE"
    _utility(lines, start, end, x, height * .13, reference, portrait, color=g.RED)
    raw = _clean(cue.get("title"))
    verse = g.multiline(raw, 22 if portrait else 43, 5 if portrait else 4, upper=False)
    size = 91 if portrait else 79
    if len(raw) > 120:
        size -= 9
    if len(raw) > 175:
        size -= 8
    g.add_text(lines, start, end, x, height * .48, verse, size=size, color=g.WARM, font=g.BODY_FONT, align=4, bold=True, spacing=0, layer=5, animation="rise")
    g.add_rect(lines, start, end, x, height * .79, width * (.34 if portrait else .22), 7 if portrait else 5, g.RED, layer=5, animation="wipe")
    g.add_text(lines, start, end, width * .92, height * .88, "AG / SCRIPTURE", size=24 if portrait else 18, color=g.CONCRETE, font=g.BODY_FONT, align=6, bold=True, spacing=2.2, layer=5, animation="fade")


def render_chapter(lines, cue, start, end, width, height, number, pathway):
    portrait = height > width
    stop = _step_number(cue, pathway, number)
    title = _clean(cue.get("title")) or _step_title(pathway, stop, "PATHWAY TEACHING")
    reference = _clean(cue.get("reference")) or _step_reference(pathway, stop)
    animation = cue.get("animation") or "wipe"
    g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, layer=2, animation=animation)
    number_x = width * (.04 if portrait else .035)
    g.add_text(lines, start, end, number_x, height * .50, f"{stop:02d}", size=310 if portrait else 330, color=g.RED, font=g.HEADLINE_FONT, align=4, bold=True, layer=3, animation="rise")
    tx = width * (.11 if portrait else .34)
    _utility(lines, start, end, tx, height * .25, "AG / SECTION", portrait)
    title_text = g.multiline(title, 20 if portrait else 31, 3, upper=True)
    g.add_text(lines, start, end, tx, height * .48, title_text, size=118 if portrait else 105, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, spacing=.25, layer=5, animation="rise")
    if reference:
        g.add_text(lines, start, end, tx, height * .74, reference.upper(), size=29 if portrait else 24, color=g.CONCRETE, font=g.BODY_FONT, align=4, bold=True, spacing=2.0, layer=5, animation="fade")


def render_statement(lines, cue, start, end, width, height, quote=False):
    portrait = height > width
    placement = cue.get("placement") or "center"
    full = placement in ("full-frame", "center") or len(_clean(cue.get("title"))) > 54
    animation = cue.get("animation") or "rise"
    title = _clean(cue.get("title"))
    body = _clean(cue.get("body") or cue.get("reference"))
    if full:
        g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, layer=2, animation=animation)
        x = width * (.08 if portrait else .075)
        _utility(lines, start, end, x, height * .16, "AG / QUOTE" if quote else "AG / IDEA", portrait)
        title_text = g.multiline(title, 18 if portrait else 28, 4, upper=True)
        g.add_text(lines, start, end, x, height * .50, title_text, size=122 if portrait else 110, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, spacing=.2, layer=5, animation="rise")
        if body:
            g.add_text(lines, start, end, x, height * .78, g.multiline(body, 34 if portrait else 55, 2, upper=False), size=31 if portrait else 25, color=g.RED, font=g.BODY_FONT, align=4, bold=True, layer=5, animation="fade")
        return
    x = width * (.055 if portrait else .06)
    y = height * (.62 if portrait else .58)
    panel_w = width * (.82 if portrait else .62)
    panel_h = height * (.23 if portrait else .22)
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.NAVY, alpha="18", layer=3, animation=animation)
    g.add_rect(lines, start, end, x, y, 7 if portrait else 5, panel_h, g.RED, layer=4, animation=animation)
    title_text = g.multiline(title, 22 if portrait else 39, 2, upper=True)
    g.add_text(lines, start, end, x + 30, y + panel_h * .52, title_text, size=72 if portrait else 58, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, layer=5, animation=animation)


def render_overlay(lines, cue, start, end, width, height, ordinal, pathway):
    kind = cue.get("kind") or "statement"
    if kind == "pathway":
        return render_pathway_card(lines, cue, start, end, width, height, ordinal, pathway)
    if kind == "scripture":
        if _scripture_needs_full_frame(cue, width, height):
            return render_scripture_full(lines, cue, start, end, width, height)
        return render_scripture_lower(lines, cue, start, end, width, height)
    if kind == "chapter":
        return render_chapter(lines, cue, start, end, width, height, ordinal, pathway)
    if kind == "statement":
        return render_statement(lines, cue, start, end, width, height)
    if kind == "quote":
        return render_statement(lines, cue, start, end, width, height, quote=True)
    return g.render_overlay(lines, cue, start, end, width, height, ordinal)


def _full_frame_ranges(plan):
    result = []
    for cue in plan.get("overlays") or []:
        kind = cue.get("kind")
        full = (
            kind in ("chapter", "pathway", "kinetic") or
            (kind == "scripture" and _scripture_needs_full_frame(cue, plan["output"]["width"], plan["output"]["height"])) or
            (kind in ("statement", "quote") and cue.get("placement") in ("full-frame", "center"))
        )
        if not full:
            continue
        for visible in cue.get("outputRanges") or []:
            result.append((float(visible.get("outputStart", 0)), float(visible.get("outputEnd", 0))))
    return sorted(result)


def _overlaps(start, end, blocked):
    return any(not (end <= bstart or start >= bend) for bstart, bend in blocked)


def add_pathway_orientation(lines, manifest, width, height):
    """Show orientation briefly after chapter changes, never for whole sections."""
    plan = manifest["renderPlan"]
    pathway = _pathway(manifest)
    if not pathway or plan.get("mode") != "podcast":
        return
    output_duration = float(plan.get("outputDuration") or 0)
    if output_duration <= 0:
        return
    blocked = _full_frame_ranges(plan)
    ordinal = 0
    for cue in plan.get("overlays") or []:
        if cue.get("kind") != "chapter":
            continue
        ordinal += 1
        ranges = cue.get("outputRanges") or []
        if not ranges:
            continue
        stop = _step_number(cue, pathway, ordinal)
        chapter_end = max(float(item.get("outputEnd", 0)) for item in ranges)
        start = chapter_end + .16
        end = min(output_duration, start + 3.0)
        if end - start < .5 or _overlaps(start, end, blocked):
            continue
        title = _clean(cue.get("title")) or _step_title(pathway, stop, _clean(pathway.get("title")))
        render_orientation_strip(lines, start, end, width, height, pathway, stop, title)


def build_broadcast_ass_v2(manifest, target):
    plan = manifest["renderPlan"]
    output = plan["output"]
    width, height = int(output["width"]), int(output["height"])
    portrait = height > width
    captions = plan.get("captions") or {}
    pathway = _pathway(manifest)

    caption_size = 94 if portrait else 56
    if captions.get("style") == "editorial":
        caption_size = 108 if portrait else 64
    elif captions.get("style") == "minimal":
        caption_size = 80 if portrait else 48
    margin_v = 300 if portrait else 115

    lines = [
        "[Script Info]", "ScriptType: v4.00+", f"PlayResX: {width}", f"PlayResY: {height}",
        "WrapStyle: 2", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]",
        "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
        f"Style: Base,{g.BODY_FONT},42,&H00{g.WARM},&H00{g.WARM},&H00{g.NAVY},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
        f"Style: Shape,{g.BODY_FONT},10,&H00{g.WARM},&H00{g.WARM},&H00{g.NAVY},&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1",
        f"Style: Caption,{g.BODY_FONT},{caption_size},&H00{g.WARM},&H00{g.WARM},&H00{g.NAVY},&H76000000,-1,0,0,0,100,100,0,0,1,{7 if portrait else 5},1,2,70,70,{margin_v},1",
        "", "[Events]", "Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ]

    if captions.get("enabled"):
        mapped = []
        for word in (manifest.get("transcript") or {}).get("words") or []:
            item = g.map_word_to_output(word, plan.get("keepSegments") or [])
            if item:
                mapped.append(item)
        max_words = max(2, min(10, int(captions.get("maxWordsPerCard") or 5)))
        style = captions.get("style") or "kinetic-clean"
        highlight = bool(captions.get("highlightCurrentWord"))
        animation = captions.get("animation") or "none"
        for group in g.caption_groups(mapped, max_words):
            for index, word in enumerate(group):
                cstart = word["start"]
                cend = group[index + 1]["start"] if index + 1 < len(group) else max(word["end"], cstart + .18)
                animation_tag = "{\\fad(60,70)}" if animation in ("rise", "pop", "highlight") else ""
                g.event(lines, cstart, cend, "Caption", animation_tag + g.caption_markup(group, index, style, highlight), layer=8)

    ordinal = 0
    for cue in plan.get("overlays") or []:
        if not _clean(cue.get("title")):
            continue
        if cue.get("kind") == "kinetic":
            # Dedicated Kinetic Graphics / 02 owns this cue after Broadcast V3.
            continue
        if cue.get("kind") == "chapter":
            ordinal += 1
        display_ordinal = ordinal or 1
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart", 0))
            end = float(visible.get("outputEnd", start))
            if end > start:
                render_overlay(lines, cue, start, end, width, height, display_ordinal, pathway)

    add_pathway_orientation(lines, manifest, width, height)

    with open(target, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
