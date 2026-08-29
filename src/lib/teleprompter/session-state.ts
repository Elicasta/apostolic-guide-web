import type {
  TeleprompterAction,
  TeleprompterSessionState,
  TeleprompterSlideSummary,
  TeleprompterTheme,
} from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function isSlideSummary(value: unknown): value is TeleprompterSlideSummary {
  if (!value || typeof value !== "object") return false;
  const slide = value as Record<string, unknown>;
  return (
    typeof slide.id === "string" &&
    typeof slide.preview === "string" &&
    (slide.heading === undefined || typeof slide.heading === "string") &&
    (slide.reference === undefined || typeof slide.reference === "string")
  );
}

export function isTeleprompterSessionState(
  value: unknown,
): value is TeleprompterSessionState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.title === "string" &&
    (state.documentId === undefined || typeof state.documentId === "string") &&
    typeof state.slideIndex === "number" &&
    Number.isInteger(state.slideIndex) &&
    (state.theme === "night" || state.theme === "day") &&
    state.mode === "script" &&
    typeof state.fontScale === "number" &&
    Number.isFinite(state.fontScale) &&
    typeof state.locked === "boolean" &&
    (state.scrolling === undefined || typeof state.scrolling === "boolean") &&
    (state.scrollSpeed === undefined ||
      (typeof state.scrollSpeed === "number" && Number.isFinite(state.scrollSpeed))) &&
    (state.scrollTopSequence === undefined ||
      (typeof state.scrollTopSequence === "number" && Number.isInteger(state.scrollTopSequence))) &&
    (state.scrollNudgeSequence === undefined ||
      (typeof state.scrollNudgeSequence === "number" && Number.isInteger(state.scrollNudgeSequence))) &&
    (state.scrollNudgeDelta === undefined ||
      (typeof state.scrollNudgeDelta === "number" && Number.isFinite(state.scrollNudgeDelta))) &&
    Array.isArray(state.slides) &&
    state.slides.length > 0 &&
    state.slides.length <= 200 &&
    state.slides.every(isSlideSummary) &&
    typeof state.sequence === "number" &&
    Number.isInteger(state.sequence) &&
    Number(state.sequence) >= 0 &&
    typeof state.updatedAt === "number" &&
    Number.isInteger(state.updatedAt) &&
    state.updatedAt >= 0 &&
    typeof state.actorId === "string" &&
    state.actorId.length >= 4 &&
    state.actorId.length <= 80
  );
}

export function normalizeTeleprompterState(
  state: TeleprompterSessionState,
): TeleprompterSessionState {
  const maxIndex = Math.max(state.slides.length - 1, 0);
  return {
    ...state,
    title: state.title.slice(0, 180),
    documentId: state.documentId?.slice(0, 180),
    slideIndex: clamp(Math.trunc(state.slideIndex), 0, maxIndex),
    fontScale: clamp(state.fontScale, 0.8, 1.3),
    mode: "script",
    scrolling: state.scrolling ?? false,
    scrollSpeed: clamp(state.scrollSpeed ?? 55, 20, 180),
    scrollTopSequence: Math.max(0, Math.trunc(state.scrollTopSequence ?? 0)),
    scrollNudgeSequence: Math.max(0, Math.trunc(state.scrollNudgeSequence ?? 0)),
    scrollNudgeDelta: clamp(state.scrollNudgeDelta ?? 0, -600, 600),
    sequence: Math.max(0, Math.trunc(state.sequence)),
    updatedAt: Math.max(0, state.updatedAt),
    actorId: state.actorId.slice(0, 80),
    slides: state.slides.slice(0, 200).map((slide) => ({
      id: slide.id.slice(0, 180),
      heading: slide.heading?.slice(0, 240),
      preview: slide.preview.slice(0, 240),
      reference: slide.reference?.slice(0, 240),
    })),
  };
}

export function shouldAcceptTeleprompterState(
  current: TeleprompterSessionState | null,
  incoming: TeleprompterSessionState,
) {
  if (!current) return true;
  if (incoming.sequence !== current.sequence) {
    return incoming.sequence > current.sequence;
  }
  if (incoming.updatedAt !== current.updatedAt) {
    return incoming.updatedAt > current.updatedAt;
  }
  return incoming.actorId > current.actorId;
}

export function applyTeleprompterAction(
  current: TeleprompterSessionState,
  action: TeleprompterAction,
  actorId: string,
  now = Date.now(),
) {
  const maxIndex = Math.max(current.slides.length - 1, 0);
  let patch: Partial<TeleprompterSessionState> = {};

  switch (action.type) {
    case "next":
      patch = { slideIndex: clamp(current.slideIndex + 1, 0, maxIndex), scrolling: false };
      break;
    case "prev":
      patch = { slideIndex: clamp(current.slideIndex - 1, 0, maxIndex), scrolling: false };
      break;
    case "goto":
      patch = { slideIndex: clamp(Math.trunc(action.index), 0, maxIndex), scrolling: false };
      break;
    case "theme":
      patch = { theme: action.theme as TeleprompterTheme };
      break;
    case "fontScale":
      patch = { fontScale: clamp(action.fontScale, 0.8, 1.3) };
      break;
    case "lock":
      patch = { locked: action.locked };
      break;
    case "scroll":
      patch = { scrolling: action.scrolling };
      break;
    case "scrollSpeed":
      patch = { scrollSpeed: clamp(action.scrollSpeed, 20, 180) };
      break;
    case "scrollTop":
      patch = { scrolling: false, scrollTopSequence: current.scrollTopSequence + 1 };
      break;
    case "scrollNudge":
      patch = {
        scrolling: false,
        scrollNudgeSequence: (current.scrollNudgeSequence ?? 0) + 1,
        scrollNudgeDelta: clamp(action.delta, -600, 600),
      };
      break;
    case "mode":
      patch = { mode: "script" };
      break;
  }

  return normalizeTeleprompterState({
    ...current,
    ...patch,
    sequence: current.sequence + 1,
    updatedAt: now,
    actorId,
  });
}

export function applyCanonicalDeck(
  incoming: TeleprompterSessionState,
  canonical: TeleprompterSessionState,
) {
  return normalizeTeleprompterState({
    ...incoming,
    title: canonical.title,
    documentId: canonical.documentId,
    slides: canonical.slides,
  });
}
