import sharp from 'sharp';
import { forgeBrandArtworkAssets, type BrandArtworkAssets } from './forge-brand-artwork';
import { renderCarouselSvg } from './carousel-render';
import type { ArtworkInput } from './carousel-artwork';
export type ForgeImageInput = Omit<ArtworkInput,'brandAssets'> & {brandAssets?:BrandArtworkAssets};
export async function renderForgeFramePng(input: ForgeImageInput) {
  const assets = input.brandAssets || await forgeBrandArtworkAssets();
  const {svg,issues} = await renderCarouselSvg(input,assets);
  if (issues.length) throw new Error(issues.join(' '));
  return sharp(Buffer.from(svg)).png().toBuffer();
}
