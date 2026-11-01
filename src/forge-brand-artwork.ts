import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FONT_FILES, type ArtworkAssets } from './carousel-render';
export type BrandArtworkAssets = ArtworkAssets;
let assetsPromise: Promise<BrandArtworkAssets> | undefined;
export async function forgeBrandArtworkAssets(): Promise<BrandArtworkAssets> {
  if (!assetsPromise) assetsPromise = (async () => {
    const [dark,light,fonts] = await Promise.all([
      readFile(join(process.cwd(),'public/brand/apostolic-guide-mark-reversed.png')),
      readFile(join(process.cwd(),'public/brand/apostolic-guide-mark.png')),
      Promise.all(FONT_FILES.map(async face=>({name:face.name,weight:face.weight,style:'normal' as const,data:await readFile(join(process.cwd(),'public/fonts',face.file))})))
    ]);
    return {darkLogo:`data:image/png;base64,${dark.toString('base64')}`,lightLogo:`data:image/png;base64,${light.toString('base64')}`,fonts};
  })().catch(error=>{assetsPromise=undefined;throw error;});
  return assetsPromise;
}
