import { readFile } from "node:fs/promises";
import { join } from "node:path";

type BrandFont = { name: string; data: ArrayBuffer; weight: 600 | 800; style: "normal" };
export type BrandArtworkAssets = { darkLogo: string; lightLogo: string; fonts: BrandFont[] };

// Logos are the actual official mark used by Carousel Studio, not AG text.
// Font files are from the open-licensed Google Fonts source repo. Downloaded
// per server instance and cached; if unavailable, the bundled default font is
// used without breaking artwork exports.
const fontSources = [
  { name: "Montserrat", weight: 800 as const, url: "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf" },
  { name: "Cormorant Garamond", weight: 600 as const, url: "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf" }
];
let assetsPromise: Promise<BrandArtworkAssets> | undefined;

async function optionalBrandFonts(): Promise<BrandFont[]> {
  const loaded = await Promise.all(fontSources.map(async face => {
    try {
      const response = await fetch(face.url, { signal: AbortSignal.timeout(4500), cache: "force-cache" });
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      if (data.byteLength < 10000 || data.byteLength > 2000000) return null;
      return {name:face.name,weight:face.weight,style:"normal" as const,data};
    } catch {
      return null;
    }
  }));
  return loaded.filter((face): face is BrandFont => Boolean(face));
}

export async function forgeBrandArtworkAssets(): Promise<BrandArtworkAssets> {
  if (!assetsPromise) assetsPromise = (async () => {
    const [dark, light, fonts] = await Promise.all([
      readFile(join(process.cwd(), "public/brand/apostolic-guide-mark-reversed.png")),
      readFile(join(process.cwd(), "public/brand/apostolic-guide-mark.png")),
      optionalBrandFonts()
    ]);
    return {darkLogo: `data:image/png;base64,${dark.toString("base64")}`,
      lightLogo:`data:image/png;base64,${light.toString("base64")}`, fonts};
  })().catch(error => { assetsPromise = undefined; throw error; });
  return assetsPromise;
}
