import "server-only";
import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";
import { codeDocument, type CodeTheme } from "./carousel-code";
import type { CreativeFrame } from "./creative-project";
import { inlineCodeAssets } from "./code-mode/assets";
export function codeResourceAllowed(raw: string, origin: string) {
  try {
    const url = new URL(raw);
    if (url.protocol === "data:")
      return /^data:(image\/(png|jpeg|webp|svg\+xml)|font\/)/i.test(raw);
    if (url.origin === origin) return /^\/(brand|fonts)\//.test(url.pathname);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "fonts.googleapis.com" ||
      host === "fonts.gstatic.com" ||
      /^[a-z0-9-]+\.supabase\.co$/.test(host) ||
      /^[a-z0-9-]+\.(public|private)\.blob\.vercel-storage\.com$/.test(host)
    );
  } catch {
    return false;
  }
}
export async function launchCodeBrowser(): Promise<Browser> {
  return puppeteer.launch({
    pipe: true,
    args: process.env.CAROUSEL_CHROMIUM_PATH
      ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
      : chromium.args,
    executablePath:
      process.env.CAROUSEL_CHROMIUM_PATH || (await chromium.executablePath()),
    headless: true,
    defaultViewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
  });
}
export async function renderCodeFrames(
  frames: CreativeFrame[],
  theme: CodeTheme,
  origin: string,
  only?: number,
) {
  origin = new URL(origin).origin;
  const browser = await launchCodeBrowser();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (codeResourceAllowed(request.url(), origin)) void request.continue();
      else void request.abort();
    });
    page.setDefaultTimeout(25000);
    const pngs: Array<{ index: number; png: Buffer }> = [];
    for (const [index, frame] of frames.entries()) {
      if (only !== undefined && index !== only) continue;
      await page.setContent(
        await inlineCodeAssets(codeDocument(frame, index, frames.length, theme, origin)),
        { waitUntil: "load", timeout: 25000 },
      );
      await page.waitForFunction("window.__codeReady === true");
      const result = await page.evaluate(
        () =>
          (
            window as unknown as {
              __codeResult: { overflow: boolean; resourceErrors: string[] };
            }
          ).__codeResult,
      );
      if (result.resourceErrors.length)
        throw new Error(
          `Slide ${index + 1}: image or font could not load. Check asset URLs.`,
        );

      pngs.push({
        index,
        png: Buffer.from(
          await page.screenshot({
            type: "png",
            clip: { x: 0, y: 0, width: 1080, height: 1350 },
            captureBeyondViewport: false,
          }),
        ),
      });
    }
    return pngs;
  } finally {
    await browser.close();
  }
}
