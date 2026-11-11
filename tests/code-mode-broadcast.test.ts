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

test("default and legacy CTA placeholders produce exactly one real linked button",()=>{
 const d=initialEmailCodeDocument({...campaign,url:"https://www.apostolicguide.com/test-cta"});
 const output=emailCodeRender(d).html;
 assert.equal((output.match(/class="ag-cta-text"/g)||[]).length,1);
 assert.match(output,/href="https:\/\/www\.apostolicguide\.com\/test-cta"/);
 assert.doesNotMatch(output,/<p class="button">/);
 const legacy=initialEmailCodeDocument({...campaign,url:"https://www.apostolicguide.com/test-cta"});
 legacy.theme.html='<div><p class="button">{{button_text}}</p><p>{{resources}}</p><p>{{body}}</p></div>';
 const old=emailCodeRender(legacy).html;
 assert.equal((old.match(/class="ag-cta-text"/g)||[]).length,1);
 assert.doesNotMatch(old,/<p[^>]*>\s*<\/p>/);
});
test("empty resources omit wrappers, nonempty resources have valid paragraphs",()=>{
 const d=initialEmailCodeDocument(campaign);
 d.theme.html='<p>{{resources}}</p>{{body}}{{button}}';
 const empty=emailCodeRender(d).html;
 assert.doesNotMatch(empty,/<p[^>]*>\s*<\/p>/);
 d.campaign.resources=[{title:"Study",summary:"Free resource",url:"https://www.apostolicguide.com/resource"}];
 const filled=emailCodeRender(d).html;
 assert.match(filled,/Free resource/);
 assert.doesNotMatch(filled,/<p[^>]*>\s*<p/);
});
test("summary maps to body and blank lines become distinct escaped paragraphs",()=>{
 const d=initialEmailCodeDocument({...campaign,summary:"First paragraph has ten words with clear biblical teaching.\n\nSecond paragraph explains the Scripture in more detail."});
 const html=emailCodeRender(d).html;
 assert.match(html,/<p[^>]*>First paragraph has ten words/);
 assert.match(html,/<p[^>]*>Second paragraph explains/);
 const paragraphs=html.match(/<p[^>]*>[^<]*paragraph[^<]*<\/p>/g)||[];
 assert.equal(paragraphs.length,2);
});
test("dark CTA has solid contrast with explicit white linked text",()=>{
 const html=emailCodeRender(initialEmailCodeDocument(campaign)).html;
 assert.match(html,/#8c2337/);
 assert.match(html,/\.ag-cta-text\{color:#ffffff!important/);
 assert.match(html,/-webkit-text-fill-color:#ffffff/);
});
