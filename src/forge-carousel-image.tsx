import "server-only";
import { ImageResponse } from "next/og";
import type { CreativeFrame, CreativeFrameRole } from "./creative-project";
import { FORGE_CAROUSEL_HEIGHT, FORGE_CAROUSEL_WIDTH } from "./forge-carousel-render-engine";

// Satori/ImageResponse outlines glyphs using its bundled Noto Sans font.
// Unlike sharp's SVG text rasterization this does not require fontconfig,
// Arial, Impact or Georgia to exist in Vercel's serverless runtime.
function colors(role: CreativeFrameRole) {
  if (role === "statement") return { background: "#b52f43", foreground: "#fffdf8", soft: "#f2ced5", accent: "#10213b" };
  if (role === "hook" || role === "cta") return { background: "#10213b", foreground: "#fffdf8", soft: "#c8ced5", accent: "#b52f43" };
  return { background: "#fffdf8", foreground: "#10213b", soft: "#545f6a", accent: "#b52f43" };
}

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
}) {
  const { frame, index, total } = input;
  const color = colors(frame.role);
  const title = frame.headline.trim() || input.projectTitle;
  const body = bodyText(frame);
  const headlineSize = title.length > 85 ? 64 : title.length > 50 ? 74 : title.length > 27 ? 88 : 106;
  const bodySize = body.length > 180 ? 30 : body.length > 115 ? 34 : 39;
  const labelStyle = { fontSize: 21, fontWeight: 700 as const, letterSpacing: 2.4, color: color.soft };
  return new ImageResponse(
    <div style={{
      display: "flex", flexDirection: "column", width: "100%", height: "100%",
      backgroundColor: color.background, color: color.foreground,
      padding: "68px 72px 66px", fontFamily: "sans-serif", position: "relative"
    }}>
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 22, borderLeft: `7px solid ${color.accent}` }}>
            <span style={{ ...labelStyle, fontSize: 20 }}>APOSTOLIC GUIDE</span>
            <span style={{ ...labelStyle, color: color.foreground, fontSize: 20 }}>{input.pathwayTitle.toUpperCase().slice(0, 48)}</span>
          </div>
          <span style={{ ...labelStyle }}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
        </div>
        <div style={{ width: "100%", height: 2, backgroundColor: color.foreground, opacity: .16, marginTop: 48, marginBottom: 35 }}/>
        <span style={{ fontSize: 25, letterSpacing: 3, color: color.accent, fontWeight: 700 }}>{frame.role.toUpperCase()}</span>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, gap: 35 }}>
          <div style={{ display: "flex", fontSize: headlineSize, lineHeight: 1.03, fontWeight: 800, letterSpacing: -1.8, overflowWrap: "break-word" }}>{title}</div>
          {body ? <div style={{ display: "flex", fontSize: bodySize, lineHeight: 1.4, fontWeight: 500, color: color.soft, overflowWrap: "break-word" }}>{body}</div> : null}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", width: "100%" }}>
        {frame.scripture.trim() ? <div style={{
          display: "flex", alignItems: "center", minHeight: 76, marginBottom: 28,
          borderLeft: `5px solid ${color.accent}`, paddingLeft: 20,
          fontSize: 29, fontWeight: 700, color: color.foreground
        }}>{frame.scripture.trim()}</div> : null}
        <div style={{ width: "100%", height: 8, borderRadius: 5, backgroundColor: color.accent }}/>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 44, width: "100%" }}>
          <span style={{ ...labelStyle, fontSize: 19 }}>THE WORD · MADE CLEAR</span>
          <span style={{ ...labelStyle, color: color.foreground, fontSize: 20 }}>AG</span>
        </div>
      </div>
    </div>,
    { width: FORGE_CAROUSEL_WIDTH, height: FORGE_CAROUSEL_HEIGHT }
  );
}

export async function renderForgeFramePng(input: Parameters<typeof createForgeFrameImage>[0]) {
  const response = createForgeFrameImage(input);
  if (!response.ok) throw new Error(`Image renderer failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
