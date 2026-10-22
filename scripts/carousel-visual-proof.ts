import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {renderForgeFramePng} from '../src/forge-carousel-image';
import {CAROUSEL_THEMES} from '../src/carousel-theme';
import {createBlankFrame,type CreativeFrame} from '../src/creative-project';
import {renderCarouselSvg} from '../src/carousel-render';
import {forgeBrandArtworkAssets} from '../src/forge-brand-artwork';
export const samples:CreativeFrame[]=[
 {...createBlankFrame(1,'hook'),headline:'The fullness of God. Revealed in Jesus.',body:'Follow the testimony of Scripture.',scripture:''},
 {...createBlankFrame(2,'scripture'),headline:'The Word became flesh.',body:'And the Word was made flesh, and dwelt among us, (and we beheld his glory, the glory as of the only begotten of the Father,) full of grace and truth.',scripture:'John 1:14'},
 {...createBlankFrame(3,'explanation'),headline:'Begin with the text.',body:'Read the passage in context. Notice who is speaking, what is being revealed, and how the surrounding verses develop the thought. Let the language of Scripture guide the questions you bring to the next passage.'},
 {...createBlankFrame(4,'support'),headline:'Read the passages together.',body:'“I and my Father are one.”\n\n“For in him dwelleth all the fulness of the Godhead bodily.”',scripture:'John 10:30 · Colossians 2:9'},
 {...createBlankFrame(5,'statement'),headline:'One God.\nFully revealed.',body:'Return to the testimony of Scripture.'},
 {...createBlankFrame(6,'cta'),headline:'Keep reading.\nKeep growing.',body:'Explore the complete Scripture Pathway.',cta:'Save this study. Share it with a friend.'}
];
async function main(){
 const output=process.argv[2]||'docs/carousel-studio-3';await mkdir(output,{recursive:true});
 const tiles:sharp.OverlayOptions[]=[];const assets=await forgeBrandArtworkAssets();const report=[];
 for(let col=0;col<CAROUSEL_THEMES.length;col++)for(let row=0;row<samples.length;row++){
  const theme=CAROUSEL_THEMES[col].id;const input={frame:samples[row],index:row,total:6,pathwayTitle:'The Identity of Jesus',projectTitle:'The fullness of God',theme};
  const result=await renderCarouselSvg(input,assets);report.push({theme,role:samples[row].role,issues:result.issues});
  const png=await sharp(Buffer.from(result.svg)).png().toBuffer();
  await writeFile(`${output}/${theme}-${samples[row].role}.png`,png);
  tiles.push({input:await sharp(png).resize(270,338).toBuffer(),left:col*282,top:row*350});
 }
 await sharp({create:{width:1398,height:2088,channels:3,background:'#deddd7'}}).composite(tiles).png().toFile(`${output}/design-directions.png`);
 await writeFile(`${output}/render-report.json`,JSON.stringify(report,null,2));
 const png=await renderForgeFramePng({frame:samples[1],index:1,total:6,pathwayTitle:'The Identity of Jesus',projectTitle:'Fullness',theme:'editorial-white'});
 console.log(`Rendered ${report.length} proofs; ${report.filter(r=>r.issues.length).length} overflow warnings; verified PNG ${png.length} bytes.`);
}
if(process.argv[1]?.includes('carousel-visual-proof'))void main();
