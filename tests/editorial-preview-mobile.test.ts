import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CreativeFrame } from "../src/creative-project";
import { FORGE_CAROUSEL_RENDER_ENGINE } from "../src/forge-carousel-render-engine";
import { renderForgeFramePng } from "../src/forge-carousel-image";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("14-day carousel previews use the same glyph-outlined PNG renderer as saved exports", () => {
  const route = source("app/api/admin/editorial/preview/route.ts");
  const exportWorker = source("src/forge-carousel-render.ts");
  assert.match(route, /await renderForgeFramePng\(/);
  assert.match(exportWorker, /await renderForgeFramePng\(/);
  assert.doesNotMatch(route, /sharp\(Buffer\.from\(svg\)\)/);
  assert.doesNotMatch(exportWorker, /sharp\(Buffer\.from\(svg\)\)/);
  assert.equal(FORGE_CAROUSEL_RENDER_ENGINE, "carousel-studio-vector-v4");
});

test("Next image renderer emits a legible-size PNG with text independent of server-installed fonts", async () => {
  const frame: CreativeFrame = {
    id: "smoke-frame",
    order: 1,
    role: "hook",
    headline: "JESUS IS GOD",
    body: "The Word was God, and the Word was made flesh.",
    scripture: "John 1:1-14",
    overlayText: "",
    supportingNotes: "",
    cta: "",
    pathwayLink: "/pathways/jesus-is-god",
    caption: "",
    altText: "Jesus Is God carousel cover"
  };
  const png = await renderForgeFramePng({ frame, index: 0, total: 7, pathwayTitle: "Jesus Is God", projectTitle: "Jesus Is God" });
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(png.byteLength > 10_000, "Output should contain actual rendered artwork, not an empty placeholder.");
});

test("mobile preview is viewport-bounded without changing the hidden full-resolution render stage", () => {
  const css = source("app/admin/carousel-mobile-viewport-repair.css");
  const layout = source("app/admin/carousel-studio/layout.tsx");
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /creative-preview-panel > \.creative-frame-preview/);
  assert.match(css, /width: min\(100%, 400px\) !important/);
  assert.match(css, /creative-workspace-grid > \.creative-frame-rail/);
  assert.doesNotMatch(css, /\\.creative-render-stage\\s*\\{[^}]*width:/s);
  assert.match(layout, /carousel-mobile-viewport-repair\.css/);
  assert.doesNotMatch(layout, /userScalable: false/);
});

test("all five shared visual directions render as distinct, valid PNGs", async () => {
  const { CAROUSEL_THEMES } = await import("../src/carousel-theme");
  const { createHash } = await import("node:crypto");
  const frame: CreativeFrame = {
    id: "verse-frame", order: 1, role: "hook",
    headline: "BEGIN WHERE SCRIPTURE BEGINS",
    body: "Compare the LORD creating alone with the New Testament creation language about Christ.",
    scripture: "Deuteronomy 6:4", overlayText:"", supportingNotes:"",cta:"",
    pathwayLink:"/pathways/god-is-one",caption:"",altText:""
  };
  const hashes = new Set<string>();
  for (const theme of CAROUSEL_THEMES) {
    const png = await renderForgeFramePng({
      frame, index:0, total:5, pathwayTitle:"God Is One",
      projectTitle:"God Is One",theme:theme.id
    });
    assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a", theme.id);
    hashes.add(createHash("sha256").update(png).digest("hex"));
  }
  assert.equal(hashes.size, CAROUSEL_THEMES.length, "Every theme must produce a distinct preview");
});
test("Carousel Studio theme selection edits controlled React project state",()=>{
  const picker=source("src/creative-template-system.tsx");
  const editor=source("src/creative-studio-client.tsx");
  assert.match(picker,/ag:creative-template-select/);
  assert.match(editor,/addEventListener\("ag:creative-template-select"/);
  assert.match(editor,/data-creative-template=\{String\(project/);
  assert.doesNotMatch(picker,/driveTemplateThroughEditor/);
});
test("14-day editing is draft-only, versioned, and leaves canonical Scripture untouched",()=>{
  const controls=source("src/editorial-draft-controls.tsx");
  const engine=source("src/editorial-engine-client.tsx");
  assert.match(controls,/project.status === "draft"/);
  assert.match(controls,/expectedStateVersion:project.stateVersion/);
  assert.match(controls,/Regenerate artwork/);
  assert.match(controls,/frames:project.editorState.frames.map/);
  assert.match(engine,/v=\$\{artworkVersion\}/);
  assert.doesNotMatch(controls,/fetch\([^)]*\/publishing|fetch\([^)]*\/schedule/i);
});
