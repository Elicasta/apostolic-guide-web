import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/carousel-studio/page.tsx", "utf8");
const layout = readFileSync("app/admin/carousel-studio/layout.tsx", "utf8");
const manual = readFileSync("src/carousel-manual-edit.tsx", "utf8");
const frameDesign = readFileSync("app/api/admin/creative-projects/[projectId]/frame-design/route.ts", "utf8");
const art = readFileSync("src/carousel-single-art-director.tsx", "utf8");
const generation = readFileSync("app/api/admin/creative-studio/generate/route.ts", "utf8");
const modes = readFileSync("src/carousel-project-modes.ts", "utf8");
const starter = readFileSync("src/carousel-project-starter.tsx", "utf8");
const imageGeneration = readFileSync("app/api/admin/pathway-assets/generate-image/route.ts", "utf8");

test("Carousel Studio mounts persistent Manual Edit and per-frame art against the active project", () => {
  assert.match(page, /<CarouselManualEdit projectId=\{projectId\}\/>/);
  assert.match(page, /<CarouselSingleArtDirector projectId=\{projectId\}\/>/);
  assert.match(layout, /carousel-capabilities-restore\.css/);
  assert.match(manual, /Manual Edit/);
  assert.match(manual, /headlineFont/);
  assert.match(manual, /bodyFont/);
  assert.match(manual, /headlineColor/);
  assert.match(manual, /bodyColor/);
  assert.match(manual, /Choose texture with Sol/);
  assert.match(manual, /\/api\/admin\/carousel-studio\/texture-direct/);
  assert.doesNotMatch(manual, /localStorage/);
});

test("Manual Reset removes the manual layer so untouched frames stay template-native", () => {
  assert.match(manual, /function clearDesign/);
  assert.match(manual, /delete board\.dataset\.manualTypography/);
  assert.match(manual, /delete board\.dataset\.texture/);
  assert.match(manual, /if \(designs\[frameId\]\) applyDesign/);
  assert.match(manual, /else clearDesign\(board\)/);
  assert.match(manual, /clearFrameBoards\(root, index\)/);
});

test("restored typography fields persist in the project frame design API", () => {
  assert.match(frameDesign, /headlineFont/);
  assert.match(frameDesign, /bodyFont/);
  assert.match(frameDesign, /headlineColor/);
  assert.match(frameDesign, /bodyColor/);
});

test("Carousel and Story regain persisted per-frame Sol visual direction without localStorage", () => {
  assert.match(art, /project\.format === "single"/);
  assert.match(art, /\/api\/admin\/carousel-studio\/background-direct/);
  assert.match(art, /\/api\/admin\/pathway-assets\/generate-image/);
  assert.match(art, /\/artwork/);
  assert.match(art, /frameId: currentFrame\.id/);
  assert.doesNotMatch(art, /localStorage/);
});

test("prompt-led generation treats Pathway as a guardrail except explicit Pathway Guide mode", () => {
  assert.match(generation, /recentCreativeAngles/);
  assert.match(generation, /\.eq\("pathway_slug", project\.pathwaySlug\)/);
  assert.match(generation, /USER DIRECTION — PRIMARY CREATIVE BRIEF/);
  assert.match(generation, /PATHWAY SCRIPTURE BANK — source material and doctrinal guardrail, NOT a required outline/);
  assert.match(generation, /FRESH-ANGLE RULE/);
  assert.match(generation, /DO NOT CLONE THESE ANGLES/);
  assert.match(modes, /This is the one mode where the Pathway itself is intentionally the outline/);
  assert.match(starter, /Prompt = idea/);
});

test("visual generation follows the requested concept instead of repeating Pathway imagery", () => {
  assert.match(imageGeneration, /CREATIVE REQUEST — PRIMARY VISUAL BRIEF/);
  assert.match(imageGeneration, /Pathway is supporting theological context/);
  assert.match(imageGeneration, /Invent a fresh visual concept for the specific request/);
});
