import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  createBlankFrame,
  type CreativeEditorState,
} from "../src/creative-project";
import {
  cleanCodeHtml,
  codeDocument,
  codeCss,
  frameMarkup,
  fromCodeJson,
  initialCodeTheme,
  parseCodeJson,
  toCodeJson,
} from "../src/carousel-code";
const frame = {
  ...createBlankFrame(1, "hook"),
  headline: 'One<br>God <img onerror="attack()">',
  body: "<script>not markup</script>",
  overlayText: "One LORD",
  scripture: "Deuteronomy 6:4",
};
const theme = initialCodeTheme("street-theology");
test("HTML removes scripts, event handlers, embeds and executable URLs while keeping inline SVG", () => {
  const html = cleanCodeHtml(
    '<script>attack()</script><iframe src="x"></iframe><img src="javascript:attack()" onerror="attack()"><svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="red"/></svg>',
  );
  assert.ok(!html.includes("attack"));
  assert.ok(!html.includes("iframe"));
  assert.ok(html.includes('viewBox="0 0 10 10"'));
  assert.ok(html.includes("<path"));
});
test("normal fields are escaped and headline br is the only allowed field markup", () => {
  const html = frameMarkup(frame, 0, 10, theme);
  assert.ok(html.includes("One<br />God &lt;img"));
  assert.ok(html.includes("&lt;script&gt;not markup&lt;/script&gt;"));
  assert.ok(!/<img[^>]+onerror=/i.test(html));
  assert.ok(html.includes("01 / 10"));
});
test("per-frame HTML and CSS isolate their overrides", () => {
  const customized = {
    ...theme,
    overrides: {
      [frame.id]: {
        html: "<h1>{{headline}}</h1><blockquote>{{quote}}</blockquote>",
        css: "h1{color:red}",
        quote: "Verified copy",
      },
    },
  };
  const html = frameMarkup(frame, 0, 2, customized);
  assert.ok(html.includes("Verified copy"));
  const other = { ...frame, id: "other" };
  assert.ok(frameMarkup(other, 1, 2, customized).includes("SCRIPTURE PATHWAY"));
  assert.ok(
    !codeDocument(
      other,
      1,
      2,
      customized,
      "https://www.apostolicguide.com",
    ).includes("h1{color:red}"),
  );
});
test("CSS import is hoisted intact including semicolons in Google Font URLs", () => {
  const result = codeCss(
    'h1{color:red}@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;800");',
  );
  assert.match(result.imports, /@400;800/);
  assert.ok(!result.css.includes("@import"));
  assert.throws(
    () => codeCss('@import "https://example.com/x.css";'),
    /only supports/,
  );
});
test("CSS cannot close the style element and inject a user script", () => {
  const doc = codeDocument(
    frame,
    0,
    1,
    { ...theme, css: "/* </style><script>attack()</script> */" },
    "https://www.apostolicguide.com",
  );
  assert.equal((doc.match(/<script nonce=/g) || []).length, 1);
  assert.ok(!doc.includes("</style><script>attack"));
  assert.ok(doc.includes("script-src &#39;nonce-ag-code-helper&#39;"));
});
test("ten-slide JSON round trips every normal field and code override", () => {
  const state: CreativeEditorState = {
    frames: Array.from({ length: 10 }, (_, i) => ({
      ...frame,
      id: `frame-${i}`,
      order: i + 1,
      headline: `Headline ${i}`,
      altText: `Alt ${i}`,
      caption: `Caption ${i}`,
    })),
    sourceImages: [],
    visualSettings: {
      style: "street-theology",
      codeMode: {
        ...theme,
        overrides: {
          "frame-9": {
            html: "<h1>{{headline}}</h1>",
            css: "h1{font-size:90px}",
          },
        },
      },
    },
  };
  const json = toCodeJson("Ten slides", state);
  const next = fromCodeJson(json);
  assert.equal(next.frames.length, 10);
  assert.equal(next.frames[9].caption, "Caption 9");
  assert.equal(
    next.visualSettings.codeMode.overrides["frame-9"].css,
    "h1{font-size:90px}",
  );
  assert.equal(next.frames[9].headline, "Headline 9");
});
test("JSON syntax and schema validation identify a line without replacing content", () => {
  assert.throws(() => parseCodeJson('{\n"version":1,\n bad\n}'), /Line 3:/);
  // The title includes 900 deliberately: the error line must point to the invalid field,
  // not an unrelated occurrence of the same number in serialized JSON.
  const json = toCodeJson("Test 900", {
    frames: [frame],
    sourceImages: [],
    visualSettings: {},
  });
  const text = JSON.stringify(
    { ...json, frames: [{ ...json.frames[0], headline: 900 }] },
    null,
    2,
  );
  const invalidFieldPosition = text.indexOf('"headline": 900');
  assert.ok(invalidFieldPosition >= 0);
  const line = text.slice(0, invalidFieldPosition).split("\n").length;
  assert.throws(() => parseCodeJson(text), new RegExp(`Line ${line}:`));
  assert.throws(
    () => fromCodeJson({ ...json, frames: [json.frames[0], json.frames[0]] }),
    /unique/,
  );
  assert.throws(
    () =>
      fromCodeJson({
        ...json,
        frames: [{ ...json.frames[0], body: "x".repeat(1401) }],
      }),
    /1400/,
  );
});
test("custom presets migration keeps direct anonymous and authenticated access closed", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create role service_role bypassrls;",
    );
    await db.exec(
      readFileSync(
        new URL(
          "../supabase/migrations/20261026211306_carousel_code_presets.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const r = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname='studio_carousel_code_presets'",
    );
    assert.equal(r.rows[0].relrowsecurity, true);
    await db.exec("set role authenticated");
    await assert.rejects(
      () => db.query("select * from public.studio_carousel_code_presets"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "insert into auth.users values ('11111111-1111-4111-8111-111111111111');set role service_role",
    );
    await db.query(
      "insert into public.studio_carousel_code_presets(created_by,name,theme) values ('11111111-1111-4111-8111-111111111111','Test',$1)",
      [JSON.stringify(theme)],
    );
    const presets = await db.query(
      "select * from public.studio_carousel_code_presets",
    );
    assert.equal(presets.rows.length, 1);
  } finally {
    await db.close();
  }
});

 test("empty custom fields stay empty; absent fields opt into legacy fallbacks", () => {
   const template = '<i>{{kicker}}</i><q>{{quote}}</q><b>{{label}}</b><small>{{eyebrow}}</small>';
   const t = {...theme, template, overrides: {[frame.id]: {html: "", css: "", kicker: "", quote: "", label: "", eyebrow: ""}}};
   assert.equal(frameMarkup(frame, 0, 1, t), '<i></i><q></q><b></b><small></small>');
   const absent = frameMarkup(frame, 0, 1, {...theme, template});
   assert.ok(absent.includes(frame.scripture));
   assert.ok(absent.includes('One LORD'));
   const state = {frames: [frame], visualSettings: {codeMode: t}, sourceImages: []} as CreativeEditorState;
   const restored = parseCodeJson(JSON.stringify(toCodeJson("Test", state)));
   assert.equal(restored.visualSettings.codeMode.overrides[frame.id].quote, "");
 });
 test("new code themes fit text by default and bundle serif Black and italic", () => {
   assert.equal(initialCodeTheme("custom").fitText, true);
   const doc = codeDocument(frame, 0, 1, theme, "https://www.apostolicguide.com");
   assert.ok(doc.includes('source-serif-pro-latin-900-normal.woff2'));
   assert.ok(doc.includes('source-serif-pro-latin-400-italic.woff2'));
 });
