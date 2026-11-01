import sharp from 'sharp';
import { forgeBrandArtworkAssets, type BrandArtworkAssets } from './forge-brand-artwork';
import { renderCarouselSvg } from './carousel-render';
import type { ArtworkInput } from './carousel-artwork';
export type ForgeImageInput = Omit<ArtworkInput,'brandAssets'> & {brandAssets?:BrandArtworkAssets};
export async function renderForgeFramePng(input: ForgeImageInput) {
  if(input.codeTheme?.enabled){const {renderCodeFrames}=await import('./carousel-code-render');const frames=Array.from({length:input.total},()=>input.frame);const pngs=await renderCodeFrames(frames,input.codeTheme,process.env.NEXT_PUBLIC_WEBSITE_URL||'https://www.apostolicguide.com',input.index);return pngs[0].png;}
  const assets = input.brandAssets || await forgeBrandArtworkAssets();
  const {svg,issues} = await renderCarouselSvg(input,assets);
  if (issues.length) throw new Error(issues.join(' '));
  return sharp(Buffer.from(svg)).png().toBuffer();
}
