import type { TeleprompterAction } from "./types";

// Reserve the existing maximum nudge magnitude for viewport-relative page steps.
// Older clients still interpret it as a normal 600px nudge.
export const PAGE_NUDGE = 600;
export const LINE_NUDGE = 110;

export function resolveScrollNudge(delta: number, viewportHeight: number): number {
  if (Math.abs(delta) !== PAGE_NUDGE) return delta;
  return Math.sign(delta) * Math.max(1, Math.floor(viewportHeight * 0.65));
}

export function manualNavigationForKey(key: string, repeat = false): TeleprompterAction | null {
  switch (key) {
    case "ArrowRight": case "PageDown": return repeat ? null : { type: "next" };
    case "ArrowLeft": case "PageUp": return repeat ? null : { type: "prev" };
    case "ArrowDown": return { type: "scrollNudge", delta: LINE_NUDGE };
    case "ArrowUp": return { type: "scrollNudge", delta: -LINE_NUDGE };
    default: return null;
  }
}
