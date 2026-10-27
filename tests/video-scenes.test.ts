import {test} from "node:test";
import assert from "node:assert/strict";
import {freshVideoScenes,resolveVideoSceneAnchors,videoSceneHtml,videoScenesSchema,videoSceneTemplates} from "../src/video-scenes";

function sample(){
 const base=freshVideoScenes("producer","e9d42796-2a55-48be-9888-49227bfed0dc");
 return {...base,scenes:[{id:"scripture",start:1,end:4,anchor:{wordIndex:2},layer:"overlay",html:"<h1>God is one</h1>",css:".kicker{opacity:1}",keyframes:[],transitionIn:"crossfade",transitionOut:"crossfade",motion:"words"}]};
}
test("kinetic scene v2 enforces end timestamps, safe CSS, unique IDs",()=>{
 const doc=sample();
 assert.equal(videoScenesSchema.safeParse(doc).success,true);
 assert.equal(videoScenesSchema.safeParse({...doc,scenes:[{...doc.scenes[0],end:0}]}).success,false);
 assert.equal(videoScenesSchema.safeParse({...doc,scenes:[doc.scenes[0],doc.scenes[0]]}).success,false);
 assert.equal(videoScenesSchema.safeParse({...doc,scenes:[{...doc.scenes[0],css:"@import url(https://host/steal.css)"}]}).success,false);
 assert.equal(videoScenesSchema.safeParse({...doc,scenes:[{...doc.scenes[0],html:""}]}).success,false);
});
test("transcript anchor survives trim mapping but rejects cut-away word",()=>{
 const doc=videoScenesSchema.parse(sample());
 const words=[{word:"We",start:0,end:.3},{word:"know",start:.5,end:.6},{word:"God",start:3,end:3.2}];
 const anchored=resolveVideoSceneAnchors(doc,words,[{start:2,end:5}]);
 assert.equal(anchored.scenes[0].start,1);
 assert.equal(anchored.scenes[0].end,4);
 assert.throws(()=>resolveVideoSceneAnchors(doc,words,[{start:4,end:5}]),/removed by a cut/);
});
test("browser HTML uses deterministic frame seeking and local fonts",()=>{
 const doc=videoScenesSchema.parse(sample());
 const html=videoSceneHtml(doc);
 assert.match(html,/__AGSeekFrame/);
 assert.match(html,/font-face/);
 assert.match(html,/montserrat-800/);
 assert.match(html,/scene-scripture/);
 assert.doesNotMatch(html,/https:\/\/fonts.googleapis.com/);
});
test("untrusted scene markup cannot execute injected script",()=>{
 const base=sample();
 base.scenes[0].html='<h1>Hello</h1><script>window.pwned=true</script><img src="https://example.com/tracker">';
 const doc=videoScenesSchema.parse(base);
 const html=videoSceneHtml(doc);
 assert.doesNotMatch(html,/window.pwned/);
 assert.doesNotMatch(html,/example.com\/tracker/);
});
test("scene starter library includes key teaching treatments",()=>{
 for(const id of ["scripture","statement","question","split","lower","list","diagram","cta"])
  assert.ok(videoSceneTemplates.some(t=>t.id===id),id);
});
