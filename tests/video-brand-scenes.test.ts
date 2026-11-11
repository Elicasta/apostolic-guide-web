import test from "node:test";
import assert from "node:assert/strict";
import {videoProducerBrandProfileSchema} from "../src/video-producer-brand-profiles";
import {videoBrandSceneStarter} from "../src/code-mode/video-brand-starter";
import {compileVideoBrandOverlayFrame} from "../src/code-mode/video-brand-overlays";
import {videoSceneDocument} from "../src/code-mode/video-scenes";

const brand=videoProducerBrandProfileSchema.parse({
 slug:"in-the-now",name:"In the Now",active:true,
 config:{
  theme:{ink:"#220909",accent:"#6A0000",paper:"#FFF9F2",fonts:["Poppins","Playfair Display","Bebas Neue"]},
  logo:{wordmark:"In the Now",assetPath:null},
  bumpers:{introSeconds:3,outroSeconds:4,outroSafeBottom:.25},
  pathwayRequired:false,doctrineGate:"optional",
  destination:{type:"youtube",youtubeHandle:"@iamelicastaneda"},
  audio:{integratedLufs:-14,truePeakDbtp:-1.5,lra:7,rnnoiseMix:0},
  captions:{font:"Poppins",fill:"#FFF9F2",highlight:"#6A0000"}
 }
});
const starter=()=>videoBrandSceneStarter({profile:brand,projectId:"f24b2fb0-5e58-412d-b81a-765f3b670980",kind:"producer",mode:"podcast",title:"Why Did Jesus Pray?",duration:360});

test("compiles timed intro, logo and outro from saved brand data",()=>{
 const doc=starter();
 assert.equal(doc.overlays?.length,3);
 assert.deepEqual(doc.overlays?.map(item=>item.type),["intro","logo","outro"]);
 assert.equal(doc.overlays?.[0].start,0);
 assert.equal(doc.overlays?.[2].start,356);
 const intro=compileVideoBrandOverlayFrame(doc,1);
 assert.match(intro.html,/Why Did Jesus Pray\?/);
 assert.match(intro.css,/--vp-accent:#6A0000/);
 assert.match(intro.css,/font-family:"Poppins"/);
 assert.match(compileVideoBrandOverlayFrame(doc,20).html,/data-timed-overlay="logo"/);
});
test("intro has equal vertical distribution and outro reserves exactly a quarter for end screens",()=>{
 const frame=compileVideoBrandOverlayFrame(starter(),357);
 assert.match(frame.css,/justify-content:space-evenly/);
 assert.match(frame.css,/\.vp-outro \.vp-card-copy\{height:75%;align-self:start\}/);
 assert.match(frame.html,/vp-outro/);
});
test("boxed highlights use symmetric side and top/bottom optical padding",()=>{
 const doc=starter();
 doc.overlays=[{type:"boxText",text:"Jesus is God.",start:1,end:3,position:"center",preset:"brand-box"}];
 const frame=compileVideoBrandOverlayFrame(doc,2);
 assert.match(frame.css,/padding:\.22em \.35em/);
 assert.match(frame.css,/top:\.015em/);
 assert.match(frame.html,/class="vp-box"/);
});
test("Short end screen is vertical with a literal channel call to action",()=>{
 const doc=videoBrandSceneStarter({profile:brand,projectId:"d8722690-6267-44eb-b617-0e728554091f",kind:"producer",mode:"reels",title:"Jesus is God.",duration:40});
 assert.deepEqual(doc.format,{w:1080,h:1920,fps:30});
 assert.match(compileVideoBrandOverlayFrame(doc,39).html,/Full episode on my channel\./);
});
test("rejects scripts and handlers in HTML, external font CSS, and single word lower thirds",()=>{
 const doc=starter();
 assert.equal(videoSceneDocument.safeParse({...doc,templateHtml:'<script>alert(1)</script>'}).success,false);
 assert.equal(videoSceneDocument.safeParse({...doc,templateHtml:'<img src=x onerror=alert(1)>'}).success,false);
 assert.equal(videoSceneDocument.safeParse({...doc,themeCss:'@import url(https://example.com/a.css)'}).success,false);
 assert.equal(videoSceneDocument.safeParse({...doc,overlays:[{type:"lowerThird",text:"JESUS",start:0,end:3,position:"lower-left",preset:"lower"}]}).success,false);
 assert.equal(videoSceneDocument.safeParse({...doc,overlays:[{type:"lowerThird",text:"Jesus is God.",start:0,end:3,position:"lower-left",preset:"lower"}]}).success,true);
});
test("shared template resolves all placeholders without treating copy as HTML",()=>{
 const doc=starter();
 doc.templateHtml='<section>{{series}} {{episodeTitle}} {{logo}} {{lowerThird}} {{boxText}} {{quote}} {{kicker}} {{label}}</section>';
 doc.fields={series:"In the Now",episodeTitle:"Questions?",logo:"ITN",lowerThird:"This is my point.",boxText:"Truth",quote:"Words",kicker:"EPISODE",label:"Personal"};
 doc.overlays=[{type:"boxText",text:'Never <script>!',start:0,end:2,position:"center",preset:"custom"}];
 const frame=compileVideoBrandOverlayFrame(doc,1);
 assert.match(frame.html,/Never &lt;script&gt;!/);
 assert.doesNotMatch(frame.html,/<script>/);
 assert.match(frame.html,/Questions\?/);
 assert.match(frame.html,/EPISODE/);
});

test("shared template cannot erase brand logo or end screen spacing",()=>{
 const doc=starter();
 doc.templateHtml='<div class="vp-template">{{boxText}}</div>';
 const outro=compileVideoBrandOverlayFrame(doc,357);
 assert.match(outro.html,/vp-outro/);
 assert.match(outro.css,/height:75%;align-self:start/);
 const logo=compileVideoBrandOverlayFrame(doc,20);
 assert.match(logo.html,/class="vp-logo"/);
 doc.overlays=[{type:"boxText",text:"Truth matters.",start:1,end:3,position:"center",preset:"brand-box"}];
 assert.match(compileVideoBrandOverlayFrame(doc,2).html,/vp-template/);
});
