/** Runs the actual Chromium export renderer and compares it with the sandboxed preview. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { zipSync, unzipSync } from "fflate";
import {
  launchCodeBrowser,
  renderCodeFrames,
  codeResourceAllowed,
} from "../src/carousel-code-render";
import {
  codeDocument,
  initialCodeTheme,
  escapeHtml,
} from "../src/carousel-code";
import { createBlankFrame } from "../src/creative-project";
async function main() {
  const server = createServer(async (req, res) => {
    try {
      if (!/^\/(fonts|brand)\/[\w.-]+$/.test(req.url || "")) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const bytes = await readFile(join(process.cwd(), "public", req.url!));
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader(
        "content-type",
        req.url!.endsWith(".woff2")
          ? "font/woff2"
          : req.url!.endsWith(".woff")
            ? "font/woff"
            : "image/png",
      );
      res.end(bytes);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const frames = Array.from({ length: 10 }, (_, i) => ({
    ...createBlankFrame(i + 1, i === 0 ? "hook" : "scripture"),
    headline: `One<br>God ${i + 1}`,
    body:
      i === 1
        ? "Hear, O Israel: The LORD our God is one LORD:"
        : "An editable text field.",
    scripture: i === 1 ? "Deuteronomy 6:4" : "",
  }));
  const theme = {
    ...initialCodeTheme("street-theology"),
    template:
      '<img class="mark" src="{{logo}}"><h1>{{headline}}</h1><p>{{body}}</p><footer>{{page}} / {{total}}</footer>',
    css: ".slide{background:#10202a;color:#f5f7f4;font-family:Inter} .mark{position:absolute;right:70px;top:70px;width:106px}h1{position:absolute;left:100px;top:430px;width:880px;font-size:100px;font-weight:800;line-height:1.2;margin:0}p{position:absolute;left:100px;top:760px;width:880px;font-size:32px}footer{position:absolute;left:100px;bottom:80px;font-size:18px}",
  };
  let browser: Awaited<ReturnType<typeof launchCodeBrowser>> | undefined;
  try {
    const pngs = await renderCodeFrames(frames, theme, origin);
    assert.equal(pngs.length, 10);
    for (const p of pngs) {
      const meta = await sharp(p.png).metadata();
      assert.equal(meta.width, 1080);
      assert.equal(meta.height, 1350);
    }
    browser = await launchCodeBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 1 });
    const doc = codeDocument(
      frames[0],
      0,
      frames.length,
      theme,
      origin,
      "proof",
    );
    await page.setContent(
      `<html><style>html,body{margin:0}iframe{border:0;display:block}</style><iframe width="1080" height="1350" sandbox="allow-scripts" srcdoc="${escapeHtml(doc)}"></iframe></html>`,
      { waitUntil: "load" },
    );
    const iframe = page.frames().find((f) => f !== page.mainFrame());
    assert.ok(iframe);
    await iframe.waitForFunction("window.__codeReady === true");
    const preview = Buffer.from(
      await page.screenshot({
        type: "png",
        clip: { x: 0, y: 0, width: 1080, height: 1350 },
      }),
    );
    assert.deepEqual(
      await sharp(preview).raw().toBuffer(),
      await sharp(pngs[0].png).raw().toBuffer(),
      "Sandbox preview and server PNG pixels differ",
    );
    const overflow = {
      ...theme,
      template:
        '<div style="width:80px;height:30px;font-size:50px;white-space:nowrap">{{body}}</div>',
    };
    await page.setContent(codeDocument(frames[0], 0, 1, overflow, origin), {
      waitUntil: "load",
    });
    await page.waitForFunction("window.__codeReady===true");
    assert.equal(
      await page.evaluate(
        () =>
          (window as unknown as { __codeResult: { overflow: boolean } })
            .__codeResult.overflow,
      ),
      true,
    );
    await renderCodeFrames([frames[0]], overflow, origin);
    const fitted = {
      ...theme,
      fitText: true,
      template:
        '<h1 data-fit style="position:absolute;width:500px;height:160px;top:400px;font-size:150px;white-space:nowrap">One God</h1>',
    };
    await renderCodeFrames([frames[0]], fitted, origin);
    assert.equal(
      codeResourceAllowed("http://169.254.169.254/latest/meta-data", origin),
      false,
    );
    assert.equal(codeResourceAllowed("https://localhost/admin", origin), false);
    assert.equal(
      codeResourceAllowed(origin + "/api/admin/projects", origin),
      false,
    );
    assert.equal(
      codeResourceAllowed("https://fonts.gstatic.com/font.woff2", origin),
      true,
    );
    const files = Object.fromEntries(
      pngs.map((p) => [
        `slide-${String(p.index + 1).padStart(2, "0")}.png`,
        new Uint8Array(p.png),
      ]),
    );
    const zip = zipSync(files, { level: 0 });
    assert.deepEqual(
      Object.keys(unzipSync(zip)),
      Array.from(
        { length: 10 },
        (_, i) => `slide-${String(i + 1).padStart(2, "0")}.png`,
      ),
    );
    await mkdir("docs/carousel-code-mode", { recursive: true });
    await writeFile("docs/carousel-code-mode/preview-100.png", preview);
    await writeFile("docs/carousel-code-mode/export-slide-01.png", pngs[0].png);
    await writeFile(
      "docs/carousel-code-mode/proof.json",
      JSON.stringify(
        {
          browser: await browser.version(),
          passed: true,
          checks: [
            "10 Chromium PNGs at 1080x1350",
            "sandbox iframe versus server raw pixel equality",
            "complete KJV passage",
            "overflow flagged",
            "fit text loop",
            "SSRF allowlist",
            "ZIP names and contents",
          ],
        },
        null,
        2,
      ),
    );
    console.log("Code Mode Chromium proof passed.");
  } finally {
    if (browser) await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
