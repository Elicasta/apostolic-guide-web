/** Shared Chromium and sandbox visual overflow detector.
 * Uses rendered browser box geometry after font loading, never character counts.
 * Deliberately does not classify decorative or transparent background layers.
 */
export type VideoTextBounds={left:number;top:number;right:number;bottom:number};
export function videoTextBoundsOverflow(child:VideoTextBounds,parent:VideoTextBounds,tolerance=3):boolean{
 return child.left<parent.left-tolerance||child.top<parent.top-tolerance||
  child.right>parent.right+tolerance||child.bottom>parent.bottom+tolerance;
}

export function detectVideoTextOverflow(doc:Document=document):string[]{
 // Keep the entire evaluator self-contained: Playwright serializes this
 // function into Chromium without module imports.
 const exceeds=(child:VideoTextBounds,parent:VideoTextBounds,tolerance=3)=>child.left<parent.left-tolerance||child.top<parent.top-tolerance||child.right>parent.right+tolerance||child.bottom>parent.bottom+tolerance;
 const target=doc;
 const view=doc.defaultView;
 if(!view)return [];
 const root=target.documentElement;
 const viewport={left:0,top:0,right:root.clientWidth,bottom:root.clientHeight};
 const selectors=[
  ".vp-card-copy",".vp-card-series",".vp-card-title",".vp-lower-third",
  ".vp-box",".vp-box span",".vp-quote",".vp-short-end",".vp-template",
  ".vp-kicker",".vp-label",".vp-logo"
 ];
 const failures:string[]=[];
 for(const item of Array.from(target.querySelectorAll<HTMLElement>(selectors.join(",")))){
  const style=view.getComputedStyle(item);
  if(style.display==="none"||style.visibility==="hidden"||Number(style.opacity)===0)continue;
  const box=item.getBoundingClientRect();
  if(!box.width||!box.height)continue;
  const label=item.getAttribute("class")||item.tagName.toLowerCase();
  // These are visible overlays, never intentionally full-bleed art.
  if(exceeds(box,viewport,4)){
   failures.push(label+" exceeds the video frame");
   continue;
  }
  if(item.scrollWidth>item.clientWidth+4||item.scrollHeight>item.clientHeight+6)
   failures.push(label+" content overflows its box");
  // Range geometry catches the content extending beyond even when the parent
  // element auto-expands and its scrollWidth appears within the viewport.
  for(const child of Array.from(item.childNodes)){
   if(child.nodeType!==target.TEXT_NODE||!child.textContent?.trim())continue;
   const range=target.createRange();
   range.selectNodeContents(child);
   const ink=range.getBoundingClientRect();
   if(ink.width>0&&ink.height>0&&exceeds(ink,box,5))
    failures.push(label+" glyphs are clipped by their container");
  }
  if(item.classList.contains("vp-outro")&&box.bottom>viewport.bottom*.75+4)
   failures.push("Outro must reserve the bottom 25 percent for end screens");
 }
 return [...new Set(failures)];
}
