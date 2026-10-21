import { normalizeCarouselTheme, type CarouselTheme } from "./carousel-theme";

/** One typography/layout contract for browser artwork and 1080px PNG exports.
 * Units are CSS container width units; multiply by 10.8 to get 1080px sizes.
 */
export function carouselFitClass(text: string) {
  const length = text.replace(/\s+/g, " ").trim().length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (length > 105 || words > 16) return "fit-xxl";
  if (length > 78 || words > 12) return "fit-xl";
  if (length > 54 || words > 9) return "fit-lg";
  if (length > 34 || words > 6) return "fit-md";
  return "fit-sm";
}

export function cleanPublicCarouselText(text: string) {
  return text
    .replace(/\s*[·:–-]\s*Part\s+\d+\s+of\s+\d+\s*$/i, "")
    .replace(/^Part\s+\d+\s+of\s+\d+\s*[·:–-]?\s*/i, "")
    .replace(/\s+continued\s*$/i, "")
    .replace(/^HOOK\s*$/i, "")
    .trim();
}

export function carouselFrameLayout(input: { theme: CarouselTheme | string; title: string; index: number; total: number; body: string; role?: string; format?: "single" | "carousel" | "story" }) {
  const theme = normalizeCarouselTheme(input.theme);
  const title = cleanPublicCarouselText(input.title);
  const cover = input.index === 0;
  const cta = input.index === input.total - 1 && input.index > 0;
  const fit = carouselFitClass(title);
  const fitTitle: Record<string,number> = { "fit-sm": 10.7, "fit-md": 9.4, "fit-lg": 8, "fit-xl": 6.9, "fit-xxl": 5.8 };
  let headlineCqw = cover ? 12 : cta ? 8.5 : fitTitle[fit];
  if (theme === "manifesto") headlineCqw = 8;
  if (cover && fit !== "fit-sm") headlineCqw = Math.min(headlineCqw, fitTitle[fit]);
  if (input.format === "story") headlineCqw = cover ? 10.4 : 9.2;
  const isScripture = input.role === "scripture";
  const isExplanation = input.role === "explanation";
  const isSupport = input.role === "support";
  const isCta = input.role === "cta" || cta;
  const bodyCqw = isScripture
    ? (input.body.length > 340 ? 3.45 : input.body.length > 260 ? 3.9 : input.body.length > 170 ? 4.55 : 5.4)
    : isExplanation ? (input.body.length > 300 ? 2.85 : input.body.length > 180 ? 3.15 : 3.45)
    : isSupport ? (input.body.length > 210 ? 3.05 : 3.4)
    : isCta ? 3.0
    : cover ? (input.body.length > 185 ? 2.8 : 3.15)
    : input.format === "story" ? 2.6 : (["cinematic", "editorial-white", "verse-connection"].includes(theme) ? 3.1 : 2.85);
  if (isScripture) headlineCqw = 2.75;
  if (isExplanation) headlineCqw = Math.min(headlineCqw, fit === "fit-sm" ? 6.2 : 5.4);
  if (isSupport) headlineCqw = Math.min(headlineCqw, 6.0);
  if (isCta) headlineCqw = Math.min(headlineCqw, 8.0);
  const bodyWidth = isScripture ? 96 : isExplanation ? 90 : isSupport ? 87 : isCta ? 85 : 84;
  const titleWidth = isScripture ? 95 : isExplanation ? 93 : 90;
  return {
    headlineCqw, bodyCqw, titleWidth, bodyWidth,
    copyLeft: 7, copyRight: 7, copyTop: 50,
    headlinePx: headlineCqw * 10.8, bodyPx: bodyCqw * 10.8,
    fit, cover, cta, isScripture, isExplanation, isSupport, isCta, cleanedTitle:title,
    isLight: theme === "editorial-white" || theme === "verse-connection",
    isSerif: ["cinematic","editorial-white","verse-connection"].includes(theme)
  };
}
