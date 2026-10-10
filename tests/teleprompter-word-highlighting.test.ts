import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SlideContent from "../src/components/teleprompter/SlideContent";
import { parseTeleprompterDocument } from "../src/lib/teleprompter/parser";
import { tokenizeSpeech } from "../src/lib/teleprompter/voice-follow";
import { splitSpokenWordParts, highlightedWordIndex } from "../src/lib/teleprompter/word-highlighting";

test("highlight tokenizer keeps exact visible punctuation and whitespace", () => {
  const input = "God's fullness, in Jesus!";
  const parts = splitSpokenWordParts(input);
  assert.equal(parts.map(part => part.text).join(""), input);
  assert.deepEqual(parts.filter(part => part.wordOffset !== null).map(part => part.text),
    ["God", "s", "fullness", "in", "Jesus"]);
  assert.equal(parts.filter(part => part.wordOffset !== null).length, tokenizeSpeech(input).length);
});

test("highlight cursor refers to last spoken word and clamps to the current slide", () => {
  assert.equal(highlightedWordIndex(0, 5), null);
  assert.equal(highlightedWordIndex(1, 5), 0);
  assert.equal(highlightedWordIndex(3, 5), 2);
  assert.equal(highlightedWordIndex(20, 5), 4);
  assert.equal(highlightedWordIndex(0, 0), null);
});

const slide = parseTeleprompterDocument(
  "# Jesus is God\n**Jesus** is the **fullness** of God.\n> The Father dwells in Him.\n@note Hidden private instruction."
)[0];

test("reader highlights exactly one word inside bold Scripture-first text", () => {
  const html = renderToStaticMarkup(createElement(SlideContent, {
    slide, theme: "night", voiceActive: true, voiceMode: "following", voiceWordIndex: 4,
  }));
  assert.match(html, /data-tp-current-word="true">fullness<\/span>/);
  assert.match(html, /<strong><span class="tp-voice-word tp-voice-word-current"/);
  assert.equal([...html.matchAll(/data-tp-current-word="true"/g)].length, 1);
  assert.equal([...html.matchAll(/data-tp-active-line="true"/g)].length, 1);
  assert.match(html, /<aside class="tp-speaker-note">/);
  assert.doesNotMatch(html, /data-tp-word-index="[0-9]+">Hidden/);
  assert.match(html, /<blockquote data-tp-word-start="6"/);
  assert.match(html, /data-tp-word-index="7">Father<\/span>/);
});

test("paused voice retains the last recognized word without changing layout", () => {
  const paused = renderToStaticMarkup(createElement(SlideContent, {
    slide, theme: "day", voiceActive: true, voiceMode: "paused", voiceWordIndex: 4,
  }));
  assert.match(paused, /data-tp-voice-mode="paused"/);
  assert.match(paused, /data-tp-current-word="true">fullness<\/span>/);
  const inactive = renderToStaticMarkup(createElement(SlideContent, {
    slide, theme: "day", voiceActive: false, voiceWordIndex: 4,
  }));
  assert.doesNotMatch(inactive, /data-tp-current-word="true"/);
  const compact = renderToStaticMarkup(createElement(SlideContent, {
    slide, theme: "night", compact: true, voiceActive: true, voiceWordIndex: 4,
  }));
  assert.doesNotMatch(compact, /data-tp-current-word="true"/);
});
