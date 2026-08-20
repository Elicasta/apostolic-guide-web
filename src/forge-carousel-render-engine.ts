import type { CreativeFrame, CreativeFrameRole } from "./creative-project";

export const FORGE_CAROUSEL_WIDTH = 1080;
export const FORGE_CAROUSEL_HEIGHT = 1350;
export const FORGE_CAROUSEL_RENDER_ENGINE = "forge-svg-v1";

type FramePalette = {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  panel: string;
  inverted: boolean;
};

const NAVY = "#10213b";
const NAVY_2 = "#172d4d";
const RED = "#b52f43";
const PAPER = "#f4f0e7";
const PAPER_2 = "#fffdf8";
const MUTED = "#7b7e82";

function palette(role: CreativeFrameRole): FramePalette {
  if (role === "hook") return { background: NAVY, foreground: PAPER_2, muted: "#c8ced5", accent: RED, panel: NAVY_2, inverted: true };
  if (role === "statement") return { background: RED, foreground: PAPER_2, muted: "#f2ced5", accent: NAVY, panel: "#a7293b", inverted: true };
  if (role === "cta") return { background: NAVY, foreground: PAPER_2, muted: "#c8ced5", accent: RED, panel: "#0b192d", inverted: true };
  if (role === "scripture") return { background: PAPER, foreground: NAVY, muted: MUTED, accent: RED, panel: PAPER_2, inverted: false };
  return { background: PAPER_2, foreground: NAVY, muted: MUTED, accent: RED, panel: PAPER, inverted: false };
}

export function escapeSvgText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function wrapForgeText(value: string, maxChars: number, maxLines: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [] as string[];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const consumed = lines.join(" ").split(" ").length;
  if (consumed < words.length && lines.length) {
    const index = lines.length - 1;
    lines[index] = `${lines[index].replace(/[.,;:!?]?$/, "").slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
}

function tspans(lines: string[], input: { x: number; y: number; lineHeight: number; className: string }) {
  return lines.map((line, index) => `<text x="${input.x}" y="${input.y + (index * input.lineHeight)}" class="${input.className}">${escapeSvgText(line)}</text>`).join("\n");
}

function headlineLayout(frame: CreativeFrame) {
  const length = frame.headline.trim().length;
  if (length <= 24) return { size: 118, lineHeight: 112, chars: 16, maxLines: 4 };
  if (length <= 48) return { size: 96, lineHeight: 94, chars: 21, maxLines: 5 };
  return { size: 78, lineHeight: 80, chars: 26, maxLines: 6 };
}

function bodyText(frame: CreativeFrame) {
  if (frame.role === "cta" && frame.cta.trim()) return frame.cta.trim();
  return frame.body.trim() || frame.overlayText.trim() || frame.supportingNotes.trim();
}

export function renderForgeFrameSvg(input: {
  frame: CreativeFrame;
  index: number;
  total: number;
  pathwayTitle: string;
  projectTitle: string;
}) {
  const { frame, index, total } = input;
  const colors = palette(frame.role);
  const head = headlineLayout(frame);
  const headline = wrapForgeText(frame.headline || input.projectTitle, head.chars, head.maxLines);
  const body = wrapForgeText(bodyText(frame), 42, frame.role === "hook" || frame.role === "statement" ? 5 : 8);
  const headlineY = frame.role === "hook" || frame.role === "statement" ? 340 : 300;
  const bodyY = Math.min(930, headlineY + (headline.length * head.lineHeight) + 92);
  const scripture = frame.scripture.trim();
  const roleLabel = frame.role.toUpperCase();
  const slide = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const pathway = input.pathwayTitle.toUpperCase().slice(0, 64);
  const accentBarY = frame.role === "cta" ? 1090 : 1160;
  const textureOpacity = colors.inverted ? 0.11 : 0.075;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${FORGE_CAROUSEL_WIDTH}" height="${FORGE_CAROUSEL_HEIGHT}" viewBox="0 0 ${FORGE_CAROUSEL_WIDTH} ${FORGE_CAROUSEL_HEIGHT}">
  <defs>
    <filter id="paper" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="${index + 11}" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0" result="mono"/>
      <feComponentTransfer in="mono" result="faded"><feFuncA type="table" tableValues="0 ${textureOpacity}"/></feComponentTransfer>
      <feBlend in="SourceGraphic" in2="faded" mode="multiply"/>
    </filter>
    <style>
      .micro { font-family: Arial, Helvetica, sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 4px; }
      .headline { font-family: Impact, "Arial Narrow", Arial, sans-serif; font-size: ${head.size}px; font-weight: 900; letter-spacing: -2px; }
      .body { font-family: Arial, Helvetica, sans-serif; font-size: 38px; font-weight: 500; }
      .scripture { font-family: Georgia, "Times New Roman", serif; font-size: 31px; font-weight: 700; font-style: italic; }
      .signature { font-family: Arial, Helvetica, sans-serif; font-size: 19px; font-weight: 800; letter-spacing: 3px; }
    </style>
  </defs>
  <rect width="1080" height="1350" fill="${colors.background}"/>
  <g filter="url(#paper)">
    <rect x="0" y="0" width="1080" height="1350" fill="${colors.background}"/>
    <rect x="68" y="62" width="7" height="86" rx="3.5" fill="${colors.accent}"/>
    <text x="98" y="91" class="micro" fill="${colors.muted}">APOSTOLIC GUIDE</text>
    <text x="98" y="126" class="micro" fill="${colors.foreground}" opacity="0.88">${escapeSvgText(pathway)}</text>
    <text x="914" y="91" class="micro" fill="${colors.muted}" text-anchor="end">${escapeSvgText(slide)}</text>
    <rect x="72" y="197" width="936" height="1" fill="${colors.foreground}" opacity="0.16"/>
    <text x="74" y="248" class="micro" fill="${colors.accent}">${escapeSvgText(roleLabel)}</text>
    ${tspans(headline, { x: 72, y: headlineY, lineHeight: head.lineHeight, className: "headline" }).replaceAll('class="headline"', `class="headline" fill="${colors.foreground}"`)}
    ${body.length ? tspans(body, { x: 76, y: bodyY, lineHeight: 55, className: "body" }).replaceAll('class="body"', `class="body" fill="${colors.foreground}" opacity="0.90"`) : ""}
    ${scripture ? `<rect x="72" y="1015" width="936" height="88" rx="14" fill="${colors.panel}" stroke="${colors.foreground}" stroke-opacity="0.10"/><text x="104" y="1071" class="scripture" fill="${colors.accent}">${escapeSvgText(scripture)}</text>` : ""}
    <rect x="72" y="${accentBarY}" width="936" height="8" rx="4" fill="${colors.accent}"/>
    <text x="74" y="1266" class="signature" fill="${colors.muted}">THE WORD · MADE CLEAR</text>
    <text x="1008" y="1266" class="signature" fill="${colors.foreground}" text-anchor="end">AG</text>
  </g>
</svg>`;
}
