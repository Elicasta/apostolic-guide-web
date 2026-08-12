import assert from "node:assert/strict";
import test from "node:test";
import { APOSTOLIC_GUIDE_AUDIO_OPENING_RULES, APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES, buildPathwayAudioScriptPrompt } from "../src/pathway-audio-script";

test("audio script prompt carries the Apostolic Oneness theological frame", () => {
  const rules = APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES;
  assert.match(rules, /one indivisible God/i);
  assert.match(rules, /Father is the eternal divine Spirit/i);
  assert.match(rules, /Son is genuinely begotten, born, given, human/i);
  assert.match(rules, /Word is God's own eternal Word/i);
  assert.match(rules, /Holy Spirit is the Spirit of the one God/i);
  assert.match(rules, /Do not reduce Father, Son, and Spirit to disposable masks/i);
  assert.match(rules, /Never affirm phrases such as "God the Son," "eternal Son,"/i);
});

test("audio script opening is branded, follow-along friendly, and platform neutral", () => {
  const rules = APOSTOLIC_GUIDE_AUDIO_OPENING_RULES;
  assert.match(rules, /Welcome to Apostolic Guide/i);
  assert.match(rules, /follow along/i);
  assert.match(rules, /open this Pathway/i);
  assert.match(rules, /Never say "click the link below,"/i);
  assert.match(rules, /"on YouTube,"/i);
  assert.match(rules, /"in the app,"/i);
  assert.match(rules, /reusable external video or podcast intro/i);
});

test("audio script prompt preserves the canonical source and supports long-form rendering", () => {
  const source = "Apostolic Guide. Jesus Is God. Isaiah 9:6. The mighty God.";
  const prompt = buildPathwayAudioScriptPrompt(source);
  assert.ok(prompt.includes(source));
  assert.match(prompt, /Apostolic Oneness/i);
  assert.match(prompt, /Welcome to Apostolic Guide/i);
  assert.match(prompt, /platform-neutral/i);
  assert.match(prompt, /3,000 to 7,500 characters/i);
  assert.match(prompt, /automatically rendered in safe audio segments/i);
  assert.match(prompt, /under 10,000 characters/i);
  assert.match(prompt, /Do not introduce historical claims or proof texts/i);
});
