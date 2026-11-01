import assert from "node:assert/strict";import test from "node:test";
import {mkdtemp,mkdir,writeFile,rm} from "node:fs/promises";import {join} from "node:path";import {tmpdir} from "node:os";import {z} from "zod";
import {defineCodeAdapter,parseCodeDocument,expandCodePlaceholders} from "../src/code-mode/core";
import {inlineCodeAssets} from "../src/code-mode/assets";
test("versioned adapters validate per-tool payloads",()=>{
 const schema=z.object({tool:z.literal("threads"),version:z.literal(1),body:z.string().max(500)});
 const adapter=defineCodeAdapter({tool:"threads",version:1,schema,fromJson:doc=>doc,toJson:doc=>schema.parse(doc)});
 assert.equal(adapter.toJson({tool:"threads",version:1,body:"Jesus is Lord"}).body,"Jesus is Lord");
 assert.throws(()=>adapter.toJson({tool:"threads",version:1,body:"x".repeat(501)}));
});
test("parser locates JSON errors",()=>{
 assert.throws(()=>parseCodeDocument('{\n"body":1,}',v=>v),/Line 2/);
 assert.throws(()=>parseCodeDocument('{\n"body":1\n}',v=>z.object({body:z.string()}).parse(v)),/Line 2/);
});
test("triple Resend braces cannot be consumed by ordinary placeholders",()=>{
 assert.equal(expandCodePlaceholders("{{body}} {{{RESEND_UNSUBSCRIBE_URL}}}",{body:"<b>",RESEND_UNSUBSCRIBE_URL:"bad"}),"&lt;b&gt; {{{RESEND_UNSUBSCRIBE_URL}}}");
});
test("server inline local fonts and images before screenshot",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"code-mode-"));
 try{await mkdir(join(dir,"fonts"));await mkdir(join(dir,"brand"));await writeFile(join(dir,"fonts","f.woff2"),"font");await writeFile(join(dir,"brand","logo.png"),"png");
 const html=await inlineCodeAssets('<style>url("/fonts/f.woff2")</style><img src="/brand/logo.png">',dir);
 assert.match(html,/data:font\/woff2;base64/);assert.match(html,/data:image\/png;base64/);assert.doesNotMatch(html,/\/fonts\/f\.woff2/);
 await assert.rejects(()=>inlineCodeAssets('<img src="/brand/f.js">',dir),/Unsupported/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
