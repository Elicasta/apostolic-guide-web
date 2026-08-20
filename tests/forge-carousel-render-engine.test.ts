import assert from "node:assert/strict";
import test from "node:test";
import type { CreativeFrame } from "../src/creative-project";
import { escapeSvgText, FORGE_CAROUSEL_HEIGHT, FORGE_CAROUSEL_WIDTH, renderForgeFrameSvg, wrapForgeText } from "../src/forge-carousel-render-engine";

function frame(overrides: Partial<CreativeFrame> = {}): CreativeFrame {
  return {
    id: "frame-1",
    order: 1,
    role: "hook",
    headline: "God Is One",
    body: "Scripture begins with one indivisible God and keeps that confession intact.",
    scripture: "Deuteronomy 6:4",
    overlayText: "",
    supportingNotes: "",
    cta: "",
    pathwayLink: "/pathways/god-is-one",
    caption: "",
    altText: "God Is One teaching slide",
    ...overrides
  };
}

test("Forge carousel renderer produces the publishing aspect ratio", () => {
  assert.equal(FORGE_CAROUSEL_WIDTH, 1080);
  assert.equal(FORGE_CAROUSEL_HEIGHT, 1350);
  const svg = renderForgeFrameSvg({ frame: frame(), index: 0, total: 7, pathwayTitle: "God Is One", projectTitle: "God Is One" });
  assert.match(svg, /width="1080" height="1350"/);
  assert.match(svg, /APOSTOLIC GUIDE/);
  assert.match(svg, /01 \/ 07/);
});

test("Forge escapes user/content text before inserting it into SVG", () => {
  assert.equal(escapeSvgText("God & <man>"), "God &amp; &lt;man&gt;");
  const svg = renderForgeFrameSvg({ frame: frame({ headline: "God & <man>" }), index: 0, total: 1, pathwayTitle: "Image & revelation", projectTitle: "Test" });
  assert.match(svg, /God &amp;/);
  assert.doesNotMatch(svg, /<man>/);
});

test("Forge bounds long copy instead of overflowing unlimited text", () => {
  const lines = wrapForgeText("one two three four five six seven eight nine ten eleven twelve thirteen", 10, 3);
  assert.equal(lines.length, 3);
  assert.match(lines[2], /…$/);
});

test("role-specific frames keep doctrine text and Scripture reference in the render", () => {
  const svg = renderForgeFrameSvg({
    frame: frame({ role: "scripture", headline: "Hear, O Israel", scripture: "Deuteronomy 6:4" }),
    index: 1,
    total: 6,
    pathwayTitle: "God Is One",
    projectTitle: "One God"
  });
  assert.match(svg, /SCRIPTURE/);
  assert.match(svg, /Deuteronomy 6:4/);
  assert.match(svg, /Hear, O Israel/);
});
