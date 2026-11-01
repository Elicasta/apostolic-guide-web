export const CAROUSEL_THEMES = [
  { id: "street-theology", label: "Street Theology", detail: "Texture + bold type" },
  { id: "editorial-white", label: "Brand White Editorial", detail: "Ivory paper + serif-like hierarchy" },
  { id: "cinematic", label: "Cinematic", detail: "Dark + restrained" },
  { id: "verse-connection", label: "Verse Connection", detail: "Connected verses + clarity" },
  { id: "manifesto", label: "Manifesto", detail: "Single strong statement" }
] as const;
export type CarouselTheme = (typeof CAROUSEL_THEMES)[number]["id"];
export function normalizeCarouselTheme(value: unknown): CarouselTheme {
  if (typeof value === "string" && CAROUSEL_THEMES.some(t => t.id === value)) return value as CarouselTheme;
  if (value === "street") return "street-theology";
  if (value === "editorial") return "editorial-white";
  if (value === "verse") return "verse-connection";
  return "street-theology";
}
export function carouselThemePalette(theme: CarouselTheme) {
  switch (theme) {
    case "editorial-white": return { bg: "#f1eee6", fg: "#102334", muted: "#465767", accent: "#af3349", soft: "#ded8cd", type: "editorial" };
    case "verse-connection": return { bg: "#f4f1e9", fg: "#0b2840", muted: "#526376", accent: "#bd2540", soft: "#e1e7e5", type: "verse" };
    case "cinematic": return { bg: "#06131f", fg: "#fcf8f2", muted: "#cad5d8", accent: "#ba3448", soft: "#173146", type: "cinematic" };
    case "manifesto": return { bg: "#101d26", fg: "#fffdf6", muted: "#dae5e6", accent: "#df334b", soft: "#233b43", type: "manifesto" };
    default: return { bg: "#0b2535", fg: "#fffdf6", muted: "#d2dce0", accent: "#d5223e", soft: "#1c3f53", type: "street" };
  }
}
