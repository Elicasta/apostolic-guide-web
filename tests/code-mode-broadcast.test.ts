import test from "node:test";import assert from "node:assert/strict";
import {emailCodeSchema,initialEmailCodeDocument,emailCodeRender} from "../src/code-mode/broadcast";
import {parseCodeDocument} from "../src/code-mode/core";
const campaign={type:"announcement" as const,subject:"Test subject",previewText:"Preview this email",eyebrow:"News",title:"Jesus Christ",summary:"The Lord is our shepherd.",ctaLabel:"Study this",url:"https://www.apostolicguide.com"};
test("email template keeps HTML safe, self-closing footer and exact unsubscribe token",()=>{
 const d=initialEmailCodeDocument(campaign);d.theme.html='<h1>{{headline}}</h1><p>{{body}}</p><script>alert(1)</script>';
 const rendered=emailCodeRender(d);assert.match(rendered.html,/href="\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}"/);assert.match(rendered.html,/href="https:\/\/www.apostolicguide.com"/);
 assert.doesNotMatch(rendered.html,/<script/);assert.match(rendered.text,/The Lord is our shepherd/);
 assert.match(rendered.html,/max-width:600px/);assert.match(rendered.html,/role="presentation"/);
});
test("email editor rejects harmful CSS and preserves media queries in head",()=>{
 const d=initialEmailCodeDocument(campaign);d.theme.css='@media(max-width:400px){h1{font-size:22px}}.eyebrow{color:red}';
 assert.match(emailCodeRender(d).html,/media\(max-width:400px\)/);
 d.theme.css='@import url("https://example.org/a.css");';
 assert.throws(()=>emailCodeRender(d),/imports are forbidden/);
});
test("campaign validates and reports line of wrong JSON",()=>{
 const doc=initialEmailCodeDocument(campaign);
 assert.equal(emailCodeSchema.parse(JSON.parse(JSON.stringify(doc))).tool,"broadcast");
 assert.throws(()=>parseCodeDocument('{\n"tool":"broadcast",\n"version":1,}',v=>emailCodeSchema.parse(v)),/Line 3/);
});
