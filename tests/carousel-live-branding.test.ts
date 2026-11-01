import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CreativeFrame } from "../src/creative-project";
import { renderForgeFramePng } from "../src/forge-carousel-image";
const read = (path: string) => readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("official logo is loaded in the image renderer, not replaced with AG text", () => {
  const assets=read("src/forge-brand-artwork.ts");
  const image=read("src/carousel-artwork.tsx");
  assert.match(assets,/apostolic-guide-mark-reversed\.png/);
  assert.match(assets,/apostolic-guide-mark\.png/);
  assert.match(image,/brandAssets.lightLogo:brandAssets.darkLogo/);
  assert.match(read("src/carousel-render.tsx"),/embedFont:true/);
});
test("visible carousel has one live React artwork, without stale mirror clones", () => {
  const client = readFileSync("src/creative-studio-client.tsx", "utf8");
  assert.match(client, /<CarouselDesignPanel/);
  assert.match(client, /frameDesigns/);
  assert.match(client, /<CarouselBackgroundPanel/);
  assert.doesNotMatch(client, /MutationObserver|createPortal|cloneNode/);
});
test("dark artwork has readable type and serif and sans themes do not inherit text color",()=>{
  const css=read("app/admin/carousel-live-contrast.css");
  const layout=read("app/admin/carousel-studio/layout.tsx");
  assert.match(layout,/carousel-live-contrast\.css/);
  assert.match(css,/is-cinematic \.carousel-copy > strong/);
  assert.match(css,/is-editorial \.carousel-copy > strong/);
  assert.match(css,/\-webkit-text-fill-color:#fffaf2 !important/);
  assert.match(css,/Cormorant Garamond/);
  assert.match(css,/Montserrat/);
});
test("brand-aware PNG exports work for dark and light theme",async()=>{
  const frame: CreativeFrame={id:"a",order:1,role:"hook",headline:"GOD IS ONE",body:"Hear, O Israel: The LORD our God is one LORD.",scripture:"Deuteronomy 6:4",overlayText:"",supportingNotes:"",cta:"",pathwayLink:"/pathways/god-is-one",caption:"",altText:""};
  for(const theme of ["cinematic","verse-connection"] as const){
    const png=await renderForgeFramePng({frame,index:0,total:5,pathwayTitle:"God Is One",projectTitle:"God Is One",theme});
    assert.equal(png.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
    assert.ok(png.byteLength>10000);
  }
});
