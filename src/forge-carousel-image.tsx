import { ImageResponse } from "next/og";
import { forgeBrandArtworkAssets, type BrandArtworkAssets } from "./forge-brand-artwork";
import type { CreativeFrame } from "./creative-project";
import { FORGE_CAROUSEL_HEIGHT, FORGE_CAROUSEL_WIDTH } from "./forge-carousel-render-engine";
import { carouselThemePalette, normalizeCarouselTheme, type CarouselTheme } from "./carousel-theme";

// One shared font-independent renderer for editorial previews, downloads and
// background Forge exports. Themes mirror Carousel Studio's art direction.
function bodyText(frame: CreativeFrame) {
  if (frame.role === "cta" && frame.cta.trim()) return frame.cta.trim();
  return frame.body.trim() || frame.overlayText.trim() || frame.supportingNotes.trim();
}

export function createForgeFrameImage(input: {
  frame: CreativeFrame;
  index: number;
  total: number;
  pathwayTitle: string;
  projectTitle: string;
  theme?: CarouselTheme | string;
  regenerationSeed?: number;
  brandAssets?: BrandArtworkAssets;
}) {
  const { frame, index, total } = input;
  const theme = normalizeCarouselTheme(input.theme);
  const c = carouselThemePalette(theme);
  const seed = Math.max(0, Math.min(10000, Math.floor(input.regenerationSeed ?? 0)));
  const title = frame.headline.trim() || input.projectTitle;
  const body = bodyText(frame);
  const dark = theme !== "verse-connection" && theme !== "editorial-white";
  const serif = theme === "cinematic" || theme === "editorial-white" || theme === "verse-connection";
  const activeFonts = input.brandAssets?.fonts ?? [];
  const heavy = theme === "manifesto" || theme === "street-theology" || theme === "verse-connection";
  const hero = frame.role === "hook" || frame.role === "statement" || frame.role === "cta";
  const titleSize = title.length > 100 ? 58 : title.length > 70 ? 67 : title.length > 42 ? 76 : title.length > 25 ? 91 : 107;
  const bodySize = body.length > 180 ? 29 : body.length > 110 ? 33 : 37;
  const centered = theme === "verse-connection" || theme === "manifesto" || (theme === "street-theology" && hero);
  const cover = hero && title.length < 95;
  const labelStyle = { fontSize: 18, fontWeight: 700 as const, letterSpacing: 3, color: c.muted };
  const stripeLeft = 30 + (seed * 13) % 70;
  const radial = dark
    ? `radial-gradient(ellipse at ${75 - seed % 15}% 20%, ${c.soft} 0%, ${c.bg} 76%)`
    : `linear-gradient(${80 + seed % 20}deg, ${c.bg}, #fffaf0 65%, ${c.bg})`;
  return new ImageResponse(
    <div style={{
      display: "flex", flexDirection: "column", position: "relative", isolation: "isolate",
      width: "100%", height: "100%", padding: "70px 72px 61px",
      backgroundColor: c.bg, backgroundImage: radial, color: c.fg, fontFamily: activeFonts.some(f => f.name === "Montserrat") ? "Montserrat" : "sans-serif"
    }}>
      {/* Cinematic ambient bars add depth without relying on remote image assets. */}
      {dark ? <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, right: 0, height: 160, alignItems: "flex-end", opacity: theme === "street-theology" ? .28 : .14 }}>
        {Array.from({ length: 12 }, (_, n) => <div key={n} style={{
          display: "flex", flex: 1, backgroundColor: "#010911",
          height: 46 + ((n * 39 + seed * 7) % 100), marginRight: n % 3 === 0 ? 8 : 0
        }}/>)}
      </div> : null}
      {(theme === "editorial-white" || theme === "verse-connection") ? <div style={{
        display: "flex", position: "absolute", left: stripeLeft, top: 280,
        width: 2, height: 690, backgroundColor: c.accent, opacity: .09
      }}/> : null}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", width: "100%", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ ...labelStyle, color: c.muted }}>SCRIPTURE PATHWAY</span>
          <span style={{ ...labelStyle, color: c.accent, fontSize: 19 }}>{input.pathwayTitle.toUpperCase().slice(0, 47)}</span>
        </div>
        {input.brandAssets ? <img src={dark ? input.brandAssets.darkLogo : input.brandAssets.lightLogo} alt="" width={124} height={100} style={{objectFit:"contain",alignSelf:"flex-start"}}/> : <span style={{ fontSize: 40, fontWeight: 900, color: c.fg, letterSpacing: -4 }}>A<span style={{ color: c.accent }}>G</span></span>}
      </div>
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, width: "100%",
        justifyContent: "center", alignItems: centered ? "center" : "flex-start",
        textAlign: centered ? "center" : "left", paddingBottom: frame.scripture ? 24 : 0
      }}>
        <span style={{ fontSize: 20, letterSpacing: 4, fontWeight: 800, color: c.accent, marginBottom: 35 }}>
          {frame.scripture.trim() || frame.role.toUpperCase()}
        </span>
        <div style={{
          display: "flex", flexDirection: "column", fontSize: Math.max(58, titleSize - (theme === "cinematic" ? 10 : 0)),
          lineHeight: heavy ? 1.01 : 1.1, fontWeight: theme === "cinematic" || theme === "editorial-white" ? 600 : 900,
          fontFamily: serif && activeFonts.some(f => f.name === "Cormorant Garamond") ? "Cormorant Garamond" : (activeFonts.some(f => f.name === "Montserrat") ? "Montserrat" : "sans-serif"),
          color: c.fg, letterSpacing: serif ? -1.6 : -2.4, textTransform: heavy && cover ? "uppercase" : "none",
          maxWidth: "100%", overflowWrap: "break-word", textAlign: centered ? "center" : "left"
        }}>{title}</div>
        {body ? <div style={{
          display: "flex", fontSize: bodySize, lineHeight: 1.46, fontWeight: 500,
          color: c.muted, fontFamily: serif && activeFonts.some(f => f.name === "Cormorant Garamond") ? "Cormorant Garamond" : (activeFonts.some(f => f.name === "Montserrat") ? "Montserrat" : "sans-serif"), textAlign: centered ? "center" : "left",
          marginTop: 34, maxWidth: "95%", overflowWrap: "break-word"
        }}>{body}</div> : null}
        {frame.cta?.trim() && frame.role !== "cta" ? <div style={{
          display: "flex", backgroundColor: c.accent, color: "#fff", padding: "12px 21px",
          marginTop: 28, fontSize: 23, fontWeight: 750
        }}>{frame.cta.trim()}</div> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "100%", position: "relative", marginTop: "auto" }}>
        {frame.scripture.trim() && theme !== "verse-connection" ? <div style={{
          display: "flex", fontSize: 22, color: c.fg, fontWeight: 750,
          borderLeft: `5px solid ${c.accent}`, paddingLeft: 17, marginBottom: 27
        }}>{frame.scripture.trim()}</div> : null}
        <div style={{ width: "100%", height: 7, backgroundColor: c.accent, borderRadius: 3 }}/>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 31, width: "100%" }}>
          <span style={{ ...labelStyle, fontSize: 17 }}>APOSTOLICGUIDE.COM</span>
          <span style={{ ...labelStyle, fontSize: 18, color: c.fg }}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </div>
      </div>
    </div>,
    { width: FORGE_CAROUSEL_WIDTH, height: FORGE_CAROUSEL_HEIGHT, fonts: activeFonts }
  );
}

export async function renderForgeFramePng(input: Parameters<typeof createForgeFrameImage>[0]) {
  const brandAssets = await forgeBrandArtworkAssets();
  const response = createForgeFrameImage({ ...input, brandAssets });
  try {
    if (!response.ok) throw new Error(`Image renderer failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    // Fonts must never break an entire Content Engine preview. A corrupt or
    // incompatible CDN face falls back to the bundled font, retaining the
    // official image-based logo, copy, contrast and background treatment.
    if (!brandAssets.fonts.length) throw error;
    const fallback = createForgeFrameImage({ ...input, brandAssets: { ...brandAssets, fonts: [] } });
    if (!fallback.ok) throw error;
    return Buffer.from(await fallback.arrayBuffer());
  }
}
