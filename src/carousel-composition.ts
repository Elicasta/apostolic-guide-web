import type { CreativeFrame, CreativeVisualSettings } from './creative-project';
import { normalizeCarouselTheme, type CarouselTheme } from './carousel-theme';

export const COMPOSITIONS = ['automatic', 'opening', 'split', 'inset', 'statement', 'reading', 'connection', 'closing'] as const;
export type Composition = typeof COMPOSITIONS[number];
export const STUDIO_FONTS = ['Montserrat', 'Cormorant Garamond', 'Bebas Neue'] as const;
export type StudioDesign = {
  layout?: Composition; variant?: number; alignment?: 'left' | 'center' | 'right';
  headlineFont?: string; bodyFont?: string; headlineScale?: number; bodyScale?: number;
  headlineWeight?: number; bodyWeight?: number; lineHeight?: number; letterSpacing?: number;
  titleWidth?: number; bodyWidth?: number; copyY?: number; copyGap?: number;
  headlineColor?: string | null; bodyColor?: string | null; textColor?: string | null;
  background?: string; accent?: string; gradient?: 'none'|'ambient'|'wash'; gradientColor?:string; texture?: string; textureStrength?: number; overlay?: number;
};
export const DESIGN_DIRECTIONS: Record<CarouselTheme, { titleFont: string; bodyFont: string; layouts: Composition[]; label: string }> = {
  'street-theology': { titleFont: 'Montserrat', bodyFont: 'Montserrat', layouts: ['opening','statement','inset'], label: 'Bold type. Urban print.' },
  'editorial-white': { titleFont: 'Cormorant Garamond', bodyFont: 'Montserrat', layouts: ['opening','inset','split'], label: 'A study in quiet confidence.' },
  cinematic: { titleFont: 'Cormorant Garamond', bodyFont: 'Montserrat', layouts: ['inset','opening','split'], label: 'Light, depth, revelation.' },
  'verse-connection': { titleFont: 'Montserrat', bodyFont: 'Montserrat', layouts: ['opening','inset','split'], label: 'Let Scripture illuminate Scripture.' },
  manifesto: { titleFont: 'Montserrat', bodyFont: 'Montserrat', layouts: ['statement','split','opening'], label: 'Conviction, set in type.' }
};
export function frameDesign(settings: CreativeVisualSettings, id: string): StudioDesign {
  const map = settings.frameDesigns;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const raw = (map as Record<string, unknown>)[id];
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as StudioDesign : {};
}
export function resolveComposition(frame: CreativeFrame, index: number, theme: CarouselTheme, seed = 0, design: StudioDesign = {}): Composition {
  if (design.layout && design.layout !== 'automatic' && COMPOSITIONS.includes(design.layout)) return design.layout;
  const variation = Math.abs(Math.floor(seed + (design.variant || 0) + index));
  if (frame.role === 'scripture') return variation % 2 ? 'reading' : 'inset';
  if (frame.role === 'support') return variation % 2 ? 'connection' : 'inset';
  if (frame.role === 'explanation') return variation % 2 ? 'split' : 'reading';
  if (frame.role === 'cta') return variation % 2 ? 'closing' : 'inset';
  const layouts = DESIGN_DIRECTIONS[theme].layouts;
  return layouts[variation % layouts.length];
}
export function finite(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
export function designColor(value: unknown, fallback: string) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback; }
export function themeFromSettings(settings: CreativeVisualSettings) { return normalizeCarouselTheme(settings.style || settings.template); }

// Public headings may carry old production labels. Biblical body text is never cleaned or rewritten.
export function publicHeading(text: string) {
  return text.replace(/^\s*(?:HOOK|CTA|EXPLANATION|SUPPORT)\s*(?:[:|·]\s*|$)/i, '').replace(/\s*[·:–-]\s*Part\s+\d+\s+of\s+\d+\s*$/i, '').trim();
}
