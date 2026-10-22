import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {createBlankFrame} from '../src/creative-project';
import {CAROUSEL_THEMES} from '../src/carousel-theme';
import {frameDesign,publicHeading,resolveComposition} from '../src/carousel-composition';
import {renderCarouselSvg} from '../src/carousel-render';
import {forgeBrandArtworkAssets} from '../src/forge-brand-artwork';
import {renderForgeFramePng} from '../src/forge-carousel-image';
const frame={...createBlankFrame(2,'scripture'),headline:'The Word became flesh.',scripture:'John 1:14',body:'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.'};
const input={frame,index:1,total:7,pathwayTitle:'The Identity of Jesus',projectTitle:'God revealed'};
test('all five directions keep a complete KJV quotation inside the reading area',async()=>{
 const assets=await forgeBrandArtworkAssets();
 for(const theme of CAROUSEL_THEMES){const result=await renderCarouselSvg({...input,theme:theme.id},assets);
  assert.deepEqual(result.issues,[],theme.id);assert.ok(result.blocks.some(block=>block.text===frame.body),`Complete quotation missing: ${theme.id}`);
  for(const block of result.blocks){assert.ok(block.top>=220);assert.ok(block.top+block.height<=1200);assert.ok(block.left>=60);assert.ok(block.left+block.width<=1020);}
 }
});
test('artwork regeneration changes composition while preserving every content field',async()=>{
 const assets=await forgeBrandArtworkAssets(),before=JSON.stringify(frame);
 const first=await renderCarouselSvg({...input,regenerationSeed:0},assets);const second=await renderCarouselSvg({...input,regenerationSeed:1},assets);
 assert.notEqual(first.svg,second.svg);assert.equal(JSON.stringify(frame),before);
 assert.notEqual(resolveComposition(frame,1,'cinematic',0),resolveComposition(frame,1,'cinematic',1));
});
test('manual frame layouts are stable and reset does not inherit an unrelated slide',()=>{
 assert.deepEqual(frameDesign({frameDesigns:{a:{layout:'split'}}},'b'),{});
 assert.equal(resolveComposition(frame,1,'cinematic',44,{layout:'reading'}),'reading');
 assert.equal(publicHeading('HOOK: Read the Word'),'Read the Word');
 assert.equal(publicHeading('God is one · Part 2 of 3'),'God is one');
});
test('overflow is reviewable and blocked from export, never silently clipped',async()=>{
 const long={...frame,body:Array(200).fill('The Word was made flesh, and dwelt among us.').join(' ')};
 const assets=await forgeBrandArtworkAssets();const result=await renderCarouselSvg({...input,frame:long},assets);
 assert.ok(result.issues.length);assert.ok(result.blocks.some(b=>b.text===long.body));
 await assert.rejects(()=>renderForgeFramePng({...input,frame:long}),/Text reaches the footer/);
});
test('the exact preview vector rasterizes to the exported 1080px PNG',async()=>{
 const assets=await forgeBrandArtworkAssets();const {svg}=await renderCarouselSvg(input,assets);
 const expected=await sharp(Buffer.from(svg)).png().toBuffer();const actual=await renderForgeFramePng(input);
 assert.deepEqual(actual,expected);const meta=await sharp(actual).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);
 const story=await renderForgeFramePng({...input,height:1920});assert.equal((await sharp(story).metadata()).height,1920);
});
test('short, long and unusual content stays complete or explicitly fails export review',async()=>{
 const assets=await forgeBrandArtworkAssets();
 for(const body of ['Jesus.',frame.body.repeat(3),'W'.repeat(100),'Line one.\n\nLine two.']) {
  const result=await renderCarouselSvg({...input,frame:{...frame,body}},assets);
  assert.ok(result.blocks.some(block=>block.text===body));
  assert.ok(!result.svg.includes('…'));
 }
});
test('the longest canonical frame of each role fits all five template directions',async()=>{
 const {allPathways}=await import('../src/pathway-catalog');
 const {buildEditorialPack,addEditorialDays}=await import('../src/editorial-engine');
 const longest=new Map<string,typeof frame>();
 for(let day=0;day<allPathways.length*7;day++)for(const candidate of buildEditorialPack(addEditorialDays('2026-10-05',day)).frames){
  const previous=longest.get(candidate.role);if(!previous||candidate.body.length+candidate.headline.length>previous.body.length+previous.headline.length)longest.set(candidate.role,candidate);
 }
 const assets=await forgeBrandArtworkAssets();
 for(const theme of CAROUSEL_THEMES)for(const candidate of longest.values()){
  const result=await renderCarouselSvg({...input,frame:candidate,theme:theme.id},assets);
  assert.deepEqual(result.issues,[],`${theme.id}: ${candidate.role}: ${candidate.headline}`);
 }
});

test('editorial direction follows a stable varied rhythm for newly prepared drafts', async () => {
  const {editorialDesignDirection} = await import('../src/editorial-design-direction');
  const choices = Array.from({length:14}, (_,i)=>editorialDesignDirection({date:`2026-10-${String(i+1).padStart(2,'0')}`,lane:'teaching'}));
  assert.equal(new Set(choices).size,3);
  assert.ok(choices.every((choice,i)=>!i || choice!==choices[i-1]));
  assert.equal(editorialDesignDirection({date:'2026-10-01',lane:'teaching'}),choices[0]);
});
