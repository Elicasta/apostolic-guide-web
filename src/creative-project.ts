export const CREATIVE_INTENTS = ["information", "teaching", "objection", "conversation", "invitation", "quote", "scripture"] as const;
export type CreativeIntent = typeof CREATIVE_INTENTS[number];

export const CREATIVE_FORMATS = ["single", "carousel", "story"] as const;
export type CreativeFormat = typeof CREATIVE_FORMATS[number];

export const CREATIVE_STATUSES = ["draft", "ready", "scheduled", "publishing", "published", "failed", "needs_manual_finish", "archived"] as const;
export type CreativeStatus = typeof CREATIVE_STATUSES[number];

export type CreativeFrameRole = "hook" | "scripture" | "explanation" | "support" | "statement" | "cta";

export type CreativeFrame = {
  id: string;
  order: number;
  role: CreativeFrameRole;
  headline: string;
  body: string;
  scripture: string;
  overlayText: string;
  supportingNotes: string;
  cta: string;
  pathwayLink: string;
  caption: string;
  altText: string;
};

export type CreativeVisualSettings = {
  style?: string;
  alignment?: "left" | "center" | "right";
  grain?: number;
  headlineScale?: number;
  bodyScale?: number;
  [key: string]: unknown;
};

export type CreativeEditorState = {
  frames: CreativeFrame[];
  visualSettings: CreativeVisualSettings;
  sourceImages: Array<{ id: string; url?: string; assetId?: string; label?: string }>;
  generatedText?: Record<string, unknown>;
  destinationSettings?: Record<string, unknown>;
};

export type CreativeProjectSnapshot = {
  title: string;
  pathwaySlug: string;
  pathwayCollection: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  destination: string;
  status: CreativeStatus;
  editorState: CreativeEditorState;
  unifiedCaption: string;
  cta: string;
  scriptureReferences: string[];
  tags: string[];
};

export const CREATIVE_INTENT_LABELS: Record<CreativeIntent, string> = {
  information: "Information",
  teaching: "Teaching",
  objection: "Objection",
  conversation: "Conversation",
  invitation: "Invitation",
  quote: "Quote",
  scripture: "Scripture"
};

export const CREATIVE_FORMAT_LABELS: Record<CreativeFormat, string> = {
  single: "Single Post",
  carousel: "Carousel",
  story: "Story"
};

const TRANSITIONS: Record<CreativeStatus, CreativeStatus[]> = {
  draft: ["ready", "archived"],
  ready: ["draft", "scheduled", "publishing", "archived"],
  scheduled: ["ready", "publishing", "failed", "needs_manual_finish", "archived"],
  publishing: ["published", "failed", "needs_manual_finish"],
  published: ["draft", "ready", "archived"],
  failed: ["draft", "ready", "scheduled", "publishing", "needs_manual_finish", "archived"],
  needs_manual_finish: ["ready", "scheduled", "published", "archived"],
  archived: ["draft"]
};

function clampInteger(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
}

function cleanString(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function recommendedFrameCount(format: CreativeFormat, intent: CreativeIntent, pathwayStepCount = 5) {
  if (format === "single") return 1;
  if (format === "story") {
    if (intent === "quote" || intent === "scripture") return 3;
    if (intent === "invitation") return 4;
    return clampInteger(pathwayStepCount, 4, 7);
  }
  if (intent === "quote" || intent === "scripture") return 4;
  if (intent === "objection" || intent === "teaching") return clampInteger(pathwayStepCount + 2, 6, 10);
  return clampInteger(pathwayStepCount + 1, 5, 9);
}

export function createBlankFrame(order: number, role: CreativeFrameRole = "explanation"): CreativeFrame {
  return {
    id: crypto.randomUUID(),
    order,
    role,
    headline: "",
    body: "",
    scripture: "",
    overlayText: "",
    supportingNotes: "",
    cta: "",
    pathwayLink: "",
    caption: "",
    altText: ""
  };
}

export function defaultRoleForFrame(index: number, total: number): CreativeFrameRole {
  if (index === 0) return "hook";
  if (index === total - 1) return "cta";
  if (index === 1) return "scripture";
  return index % 2 === 0 ? "explanation" : "support";
}

export function createDefaultFrames(format: CreativeFormat, count: number): CreativeFrame[] {
  const total = format === "single" ? 1 : clampInteger(count, 1, 20);
  return Array.from({ length: total }, (_, index) => createBlankFrame(index + 1, format === "single" ? "statement" : defaultRoleForFrame(index, total)));
}

export function normalizeCreativeFrames(format: CreativeFormat, rawFrames: unknown): CreativeFrame[] {
  const source = Array.isArray(rawFrames) ? rawFrames : [];
  const limited = format === "single" ? source.slice(0, 1) : source.slice(0, 20);
  if (!limited.length) return createDefaultFrames(format, 1);
  return limited.map((value, index) => {
    const frame = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const role = ["hook", "scripture", "explanation", "support", "statement", "cta"].includes(String(frame.role))
      ? String(frame.role) as CreativeFrameRole
      : defaultRoleForFrame(index, limited.length);
    return {
      id: cleanString(frame.id, 100) || `frame-${index + 1}`,
      order: index + 1,
      role,
      headline: cleanString(frame.headline, 240),
      body: cleanString(frame.body, 1400),
      scripture: cleanString(frame.scripture, 180),
      overlayText: cleanString(frame.overlayText, 500),
      supportingNotes: cleanString(frame.supportingNotes, 1600),
      cta: cleanString(frame.cta, 500),
      pathwayLink: cleanString(frame.pathwayLink, 500),
      caption: cleanString(frame.caption, 2200),
      altText: cleanString(frame.altText, 1000)
    };
  });
}

export function normalizeEditorState(format: CreativeFormat, rawState: unknown): CreativeEditorState {
  const state = rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState as Record<string, unknown> : {};
  const visualSettings = state.visualSettings && typeof state.visualSettings === "object" && !Array.isArray(state.visualSettings)
    ? state.visualSettings as CreativeVisualSettings
    : {};
  const sourceImages = Array.isArray(state.sourceImages)
    ? state.sourceImages.slice(0, 50).map((item, index) => {
      const image = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        id: cleanString(image.id, 100) || `source-${index + 1}`,
        url: cleanString(image.url, 1200) || undefined,
        assetId: cleanString(image.assetId, 100) || undefined,
        label: cleanString(image.label, 180) || undefined
      };
    })
    : [];
  return {
    frames: normalizeCreativeFrames(format, state.frames),
    visualSettings,
    sourceImages,
    generatedText: state.generatedText && typeof state.generatedText === "object" && !Array.isArray(state.generatedText) ? state.generatedText as Record<string, unknown> : undefined,
    destinationSettings: state.destinationSettings && typeof state.destinationSettings === "object" && !Array.isArray(state.destinationSettings) ? state.destinationSettings as Record<string, unknown> : undefined
  };
}

export function canTransitionCreativeStatus(from: CreativeStatus, to: CreativeStatus) {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertCreativeStatusTransition(from: CreativeStatus, to: CreativeStatus) {
  if (!canTransitionCreativeStatus(from, to)) throw new Error(`Creative Project cannot move from ${from} to ${to}.`);
}

export function collectScriptureReferences(frames: CreativeFrame[]) {
  return Array.from(new Set(frames.map((frame) => frame.scripture.trim()).filter(Boolean))).slice(0, 50);
}

export function copyAllFrameCaptions(frames: CreativeFrame[]) {
  return frames.map((frame, index) => `SLIDE ${index + 1}\n${frame.caption.trim() || ""}`.trimEnd()).join("\n\n");
}

export function buildCreativeSearchText(input: {
  title: string;
  pathwayTitle?: string;
  pathwaySlug: string;
  intent: CreativeIntent;
  format: CreativeFormat;
  frames: CreativeFrame[];
  unifiedCaption?: string;
  tags?: string[];
}) {
  return [
    input.title,
    input.pathwayTitle,
    input.pathwaySlug,
    input.intent,
    input.format,
    input.unifiedCaption,
    ...(input.tags ?? []),
    ...input.frames.flatMap((frame) => [frame.headline, frame.body, frame.scripture, frame.caption, frame.altText])
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 40000);
}

export function reorderCreativeFrames(frames: CreativeFrame[], activeId: string, targetIndex: number) {
  const currentIndex = frames.findIndex((frame) => frame.id === activeId);
  if (currentIndex < 0) return frames;
  const next = frames.map((frame) => ({ ...frame }));
  const [moved] = next.splice(currentIndex, 1);
  next.splice(clampInteger(targetIndex, 0, next.length), 0, moved);
  return next.map((frame, index) => ({ ...frame, order: index + 1 }));
}
