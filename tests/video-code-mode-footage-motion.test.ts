import test from "node:test";import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {videoSceneDocument} from "../src/code-mode/video-scenes";
import {footageFilter} from "../src/code-mode/video-footage-motion";
test("footage punch is eased and centered, not an immediate hard crop",()=>{
 const document=videoSceneDocument.parse(JSON.parse(readFileSync("tests/fixtures/video-code-mode-kinetic-5s.json","utf8")));
 const filter=footageFilter(document);
 assert.match(filter,/zoompan=z='/);
 assert.match(filter,/cos\(2\*PI/);
 assert.match(filter,/iw\/2-\(iw\/zoom\/2\)/);
 assert.match(filter,/fps=30/);
});
test("no camera punch keeps legacy FFmpeg fit pipeline",()=>{
 const document=videoSceneDocument.parse(JSON.parse(readFileSync("tests/fixtures/video-code-mode-v2.json","utf8")));
 const filter=footageFilter(document);
 assert.doesNotMatch(filter,/zoompan/);
 assert.match(filter,/force_original_aspect_ratio=increase/);
});
