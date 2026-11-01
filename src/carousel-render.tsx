import satori, { type Font } from 'satori';
import { CarouselArtwork, type ArtworkInput } from './carousel-artwork';

export type ArtworkAssets = {darkLogo:string;lightLogo:string;fonts:Font[]};
export const FONT_FILES = [
  {name:'Montserrat',weight:400 as const,file:'montserrat-400.woff'},
  {name:'Montserrat',weight:800 as const,file:'montserrat-800.woff'},
  {name:'Cormorant Garamond',weight:400 as const,file:'cormorant-400.woff'},
  {name:'Cormorant Garamond',weight:700 as const,file:'cormorant-700.woff'},
  {name:'Cormorant Garamond',weight:600 as const,file:'cormorant-600.woff'},
  {name:'Bebas Neue',weight:400 as const,file:'bebas-400.woff'}
];
async function renderPass(input: Omit<ArtworkInput,'brandAssets'>, assets: ArtworkAssets) {
  const height = input.height || 1350;
  const issues: string[] = [];
  const blocks:Array<{kind:string;text:string;left:number;top:number;width:number;height:number}>=[];
  const svg = await satori(CarouselArtwork({...input,brandAssets:assets}), {
    width:1080,height,fonts:assets.fonts,embedFont:true,
    onNodeDetected(node) {
      if(node.props?.['data-copy-block'])blocks.push({kind:node.props['data-copy-block'],text:node.textContent||String(node.props.children||''),left:node.left,top:node.top,width:node.width,height:node.height});
      if (node.props?.['data-copy-block'] && node.top+node.height > height-150) issues.push('Text reaches the footer. Reduce type size, widen the text, or move complete content to another slide.');
    }
  });
  return {svg,issues:[...new Set(issues)],blocks};
}

/** Fit automatic typography using actual font metrics; never rewrite or truncate copy. */
export async function renderCarouselSvg(input: Omit<ArtworkInput,'brandAssets'>, assets: ArtworkAssets) {
  let result = await renderPass(input, assets);
  const design = input.design || {};
  // Explicit typography/position overrides remain authoritative and report overflow.
  if (design.headlineScale !== undefined || design.bodyScale !== undefined || design.copyY !== undefined) return result;
  for (const scale of [.92, .84, .76, .68, .60, .55]) {
    if (!result.issues.length) break;
    result = await renderPass({...input, design: {...design, headlineScale: scale, bodyScale: Math.max(.65, scale)}}, assets);
  }
  return result;
}
