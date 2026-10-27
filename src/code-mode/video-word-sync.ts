import {videoSceneDocument,type VideoSceneDocument} from "./video-scenes";
export type TimedWord={word:string;start:number;end:number};
export type KeepRange={start:number;end:number};
function simple(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,"");}
export function wordsOnOutput(words:TimedWord[],ranges:KeepRange[]):Array<TimedWord&{sourceIndex:number}>{
 let cursor=0;
 const mapped:Array<TimedWord&{sourceIndex:number}>=[];
 for(const range of ranges){
  if(!(Number.isFinite(range.start)&&Number.isFinite(range.end))||range.start<0||range.end<=range.start)
   throw new Error("Invalid kept segment in edit plan");
  words.forEach((w,sourceIndex)=>{
   const midpoint=(w.start+w.end)/2;
   if(midpoint<range.start||midpoint>=range.end)return;
   const start=cursor+Math.max(0,w.start-range.start);
   const end=Math.max(start+.04,cursor+Math.min(range.end-range.start,w.end-range.start));
   mapped.push({word:w.word,start,end,sourceIndex});
  });
  cursor+=range.end-range.start;
 }
 return mapped;
}
export function alignVideoSceneWords(input:VideoSceneDocument,words:TimedWord[],keep:KeepRange[]):VideoSceneDocument{
 const doc=videoSceneDocument.parse(input);
 if(doc.scenes.every(s=>!s.anchor))return doc;
 const mapped=wordsOnOutput(words,keep);
 const scenes=doc.scenes.map(s=>{
  if(!s.anchor)return s;
  let found:(typeof mapped)[number]|undefined;
  if(s.anchor.wordIndex!==undefined)found=mapped.find(w=>w.sourceIndex===s.anchor!.wordIndex);
  else if(s.anchor.phrase){
   const tokens=s.anchor.phrase.split(/\s+/).map(simple).filter(Boolean);
   for(let i=0;i<=mapped.length-tokens.length;i++){
    if(tokens.every((token,k)=>simple(mapped[i+k].word)===token)){found=mapped[i];break;}
   }
  }
  if(!found)throw new Error("Scene "+s.id+" references a word/phrase removed by the edit. Re-anchor before approval.");
  const start=Math.max(0,found.start);
  return {...s,start,end:start+(s.end-s.start)};
 });
 return videoSceneDocument.parse({...doc,scenes:scenes.sort((a,b)=>a.start-b.start)});
}
