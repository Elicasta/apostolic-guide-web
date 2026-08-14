#!/usr/bin/env python3
"""Pathway-aware Apostolic Guide Broadcast Graphics System V2.

V2 keeps the approved Broadcast Graphics System / 01 look while optimizing the
actual rendered master for phone readability and pathway orientation.
"""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V1_PATH = os.path.join(ROOT, "scripts", "video_producer_broadcast_graphics.py")
SPEC = importlib.util.spec_from_file_location("ag_broadcast_v1", V1_PATH)
g = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(g)


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


def render_left_follower(lines, start, end, width, height, pathway, stop_number, segment_title):
    if not pathway or end <= start:
        return
    portrait = height > width
    if portrait:
        # Reels already use captions and more aggressive framing. Keep orientation compact.
        x, y, panel_w, panel_h = 48, 120, 560, 142
        label_size, title_size = 25, 38
    else:
        x, y, panel_w, panel_h = 54, 58, 510, 112
        label_size, title_size = 20, 31
    pathway_title = _clean(pathway.get("title")).upper()
    segment = _clean(segment_title or _step_title(pathway, stop_number, "PATHWAY TEACHING")).upper()
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.NAVY, alpha="12", layer=2, animation="none")
    g.add_rect(lines, start, end, x, y, 7, panel_h, g.RED, layer=3, animation="none")
    g.add_text(lines, start, end, x + 22, y + 29, f"{pathway_title}  ·  STOP {stop_number}", size=label_size, color=g.CONCRETE, font=g.BODY_FONT, align=7, bold=True, spacing=1.7, layer=4, animation="none")
    title = g.multiline(segment, 30 if portrait else 34, 2, upper=False)
    g.add_text(lines, start, end, x + 22, y + 67, title, size=title_size, color=g.WARM, font=g.HEADLINE_FONT, align=7, bold=True, spacing=.7, layer=4, animation="none")


def render_pathway_bug(lines, cue, start, end, width, height):
    d = g.dimensions(width, height)
    portrait = d["portrait"]
    panel_w = min(width - d["safe_x"] * 2, 980 if portrait else 850)
    panel_h = 170 if portrait else 124
    x = d["safe_x"]
    y = height - (410 if portrait else 198)
    tile = panel_h
    animation = cue.get("animation") or "rise"
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.WARM, layer=3, animation=animation)
    g.logo_tile(lines, start, end, x, y, tile, animation=animation)
    g.add_rect(lines, start, end, x + panel_w - 26, y, 26, panel_h, g.RED, layer=4, animation=animation)
    title = g.multiline(cue.get("title"), 28, 1, upper=True)
    body = g.multiline(cue.get("body") or "Follow along through the Scriptures", 48, 1, upper=False)
    tx = x + tile + (34 if portrait else 30)
    g.add_text(lines, start, end, tx, y + panel_h * .39, title, size=58 if portrait else 48, color=g.NAVY, font=g.HEADLINE_FONT, align=4, bold=True, animation=animation)
    if body:
        g.add_text(lines, start, end, tx, y + panel_h * .72, body, size=27 if portrait else 23, color=g.CHARCOAL, font=g.BODY_FONT, align=4, animation=animation)


def _scripture_needs_full_frame(cue, width, height):
    if cue.get("placement") in ("full-frame", "center"):
        return True
    text = _clean(cue.get("title"))
    threshold = 72 if height <= width else 54
    return len(text) > threshold


def render_scripture_lower(lines, cue, start, end, width, height):
    d = g.dimensions(width, height)
    portrait = d["portrait"]
    x = d["safe_x"]
    panel_w = min(width - d["safe_x"] * 2, 1050 if portrait else 1390)
    panel_h = 260 if portrait else 190
    y = height - (520 if portrait else 272)
    ref_w = 230 if portrait else 250
    animation = cue.get("animation") or "fade"
    g.add_rect(lines, start, end, x, y, panel_w, panel_h, g.WARM, layer=3, animation=animation)
    g.add_rect(lines, start, end, x, y, ref_w, panel_h, g.NAVY, layer=4, animation=animation)
    g.add_rect(lines, start, end, x + ref_w, y, 8, panel_h, g.RED, layer=5, animation=animation)

    reference = g.multiline(cue.get("reference") or "SCRIPTURE", 18, 2, upper=True)
    g.add_text(lines, start, end, x + 28, y + panel_h * .50, reference, size=38 if portrait else 31, color=g.WARM, font=g.HEADLINE_FONT, align=4, bold=True, spacing=1.3, animation=animation)

    raw = _clean(cue.get("title"))
    size = 66 if portrait else 58
    wrap = 22 if portrait else 38
    if len(raw) > 52:
        size -= 6
        wrap += 5
    verse = g.multiline(raw, wrap, 2, upper=False)
    g.add_text(lines, start, end, x + ref_w + 44, y + panel_h * .50, verse, size=size, color=g.NAVY, font=g.BODY_FONT, align=4, bold=True, spacing=.1, animation=animation)


def render_scripture_full(lines, cue, start, end, width, height):
    d = g.dimensions(width, height)
    animation = cue.get("animation") or "fade"
    g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, alpha="02", layer=2, animation=animation)
    margin = 82 if d["portrait"] else 96
    g.add_corner_marks(lines, start, end, margin, margin, width - margin * 2, height - margin * 2, color=g.WARM, animation=animation)
    bookmark_w = 44 if d["portrait"] else 34
    bookmark_h = 78 if d["portrait"] else 58
    g.add_rect(lines, start, end, width / 2 - bookmark_w / 2, margin - 2, bookmark_w, bookmark_h, g.RED, layer=4, animation=animation)

    raw = _clean(cue.get("title"))
    title_size = 94 if d["portrait"] else 82
    if len(raw) > 105:
        title_size -= 10
    if len(raw) > 160:
        title_size -= 8
    verse = g.multiline(raw, 24 if d["portrait"] else 38, 5, upper=False)
    g.add_text(lines, start, end, width / 2, height * .48, verse, size=title_size, color=g.WARM, font=g.BODY_FONT, align=5, bold=True, spacing=.15, animation=animation)
    g.add_line(lines, start, end, width / 2 - (90 if d["portrait"] else 70), height * .70, 180 if d["portrait"] else 140, 5, g.RED, animation=animation)
    reference = g.multiline(cue.get("reference") or "SCRIPTURE", 38, 1, upper=True)
    g.add_text(lines, start, end, width / 2, height * .78, reference, size=36 if d["portrait"] else 30, color=g.CONCRETE, font=g.BODY_FONT, align=5, bold=True, spacing=2, animation=animation)


def render_chapter(lines, cue, start, end, width, height, number, pathway):
    d = g.dimensions(width, height)
    animation = cue.get("animation") or "wipe"
    stop = _step_number(cue, pathway, number)
    g.add_rect(lines, start, end, 0, 0, width, height, g.NAVY, alpha="02", layer=2, animation=animation)
    title = g.multiline(cue.get("title") or _step_title(pathway, stop, "PATHWAY TEACHING"), 24 if d["portrait"] else 31, 3, upper=True)
    g.add_text(lines, start, end, width / 2, height * .35, f"PATHWAY STOP {stop}", size=34 if d["portrait"] else 29, color=g.CONCRETE, font=g.BODY_FONT, align=5, bold=True, spacing=4, animation=animation)
    g.add_text(lines, start, end, width / 2, height * .52, title, size=116 if d["portrait"] else 96, color=g.WARM, font=g.HEADLINE_FONT, align=5, bold=True, spacing=1.4, animation=animation)
    g.add_line(lines, start, end, width / 2 - 105, height * .67, 210, 5, g.RED, animation=animation)
    reference = _clean(cue.get("reference"))
    if not reference and pathway:
        steps = pathway.get("steps") or []
        if 1 <= stop <= len(steps):
            reference = _clean(steps[stop - 1].get("reference"))
    if reference:
        g.add_text(lines, start, end, width / 2, height * .76, reference.upper(), size=28 if d["portrait"] else 24, color=g.CONCRETE, font=g.BODY_FONT, align=5, bold=True, spacing=1.8, animation=animation)


def render_overlay(lines, cue, start, end, width, height, ordinal, pathway):
    kind = cue.get("kind") or "statement"
    if kind == "pathway":
        return render_pathway_bug(lines, cue, start, end, width, height)
    if kind == "scripture":
        if _scripture_needs_full_frame(cue, width, height):
            return render_scripture_full(lines, cue, start, end, width, height)
        return render_scripture_lower(lines, cue, start, end, width, height)
    if kind == "chapter":
        return render_chapter(lines, cue, start, end, width, height, ordinal, pathway)
    return g.render_overlay(lines, cue, start, end, width, height, ordinal)


def _full_frame_ranges(plan):
    result = []
    for cue in plan.get("overlays") or []:
        full = cue.get("kind") == "chapter" or (cue.get("kind") == "scripture" and _scripture_needs_full_frame(cue, plan["output"]["width"], plan["output"]["height"]))
        if not full:
            continue
        for visible in cue.get("outputRanges") or []:
            result.append((float(visible.get("outputStart", 0)), float(visible.get("outputEnd", 0))))
    return sorted(result)


def _subtract_ranges(start, end, blocked):
    ranges = [(start, end)]
    for bstart, bend in blocked:
        next_ranges = []
        for rstart, rend in ranges:
            if bend <= rstart or bstart >= rend:
                next_ranges.append((rstart, rend))
                continue
            if bstart > rstart:
                next_ranges.append((rstart, bstart))
            if bend < rend:
                next_ranges.append((bend, rend))
        ranges = next_ranges
    return [(a, b) for a, b in ranges if b - a >= .25]


def add_pathway_followers(lines, manifest, width, height):
    plan = manifest["renderPlan"]
    pathway = _pathway(manifest)
    if not pathway or plan.get("mode") != "podcast":
        return
    output_duration = float(plan.get("outputDuration") or 0)
    if output_duration <= 0:
        return
    chapters = []
    ordinal = 0
    for cue in plan.get("overlays") or []:
        if cue.get("kind") != "chapter":
            continue
        ordinal += 1
        ranges = cue.get("outputRanges") or []
        if not ranges:
            continue
        stop = _step_number(cue, pathway, ordinal)
        first_start = float(ranges[0].get("outputStart", 0))
        last_end = max(float(item.get("outputEnd", first_start)) for item in ranges)
        chapters.append({"start": first_start, "end": last_end, "stop": stop, "title": _clean(cue.get("title"))})
    chapters.sort(key=lambda item: item["start"])
    blocked = _full_frame_ranges(plan)

    if not chapters:
        title = _step_title(pathway, 1, _clean(pathway.get("title")))
        for start, end in _subtract_ranges(0, output_duration, blocked):
            render_left_follower(lines, start, end, width, height, pathway, 1, title)
        return

    for index, chapter in enumerate(chapters):
        section_start = chapter["end"]
        section_end = chapters[index + 1]["start"] if index + 1 < len(chapters) else output_duration
        if section_end <= section_start:
            continue
        title = chapter["title"] or _step_title(pathway, chapter["stop"], _clean(pathway.get("title")))
        for start, end in _subtract_ranges(section_start, section_end, blocked):
            render_left_follower(lines, start, end, width, height, pathway, chapter["stop"], title)


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

    output_duration = float(plan.get("outputDuration") or 0)
    if output_duration > 0 and not pathway:
        g.render_brand_bug(lines, 0, output_duration, width, height)

    ordinal = 0
    for cue in plan.get("overlays") or []:
        if not _clean(cue.get("title")):
            continue
        if cue.get("kind") == "chapter":
            ordinal += 1
        display_ordinal = ordinal or 1
        for visible in cue.get("outputRanges") or []:
            start = float(visible.get("outputStart", 0))
            end = float(visible.get("outputEnd", start))
            if end > start:
                render_overlay(lines, cue, start, end, width, height, display_ordinal, pathway)

    add_pathway_followers(lines, manifest, width, height)

    with open(target, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
