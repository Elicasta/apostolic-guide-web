export type TeleprompterTheme = "night" | "day";
export type TeleprompterMode = "script" | "cue" | "minimal";

export interface TeleprompterDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeleprompterSlide {
  id: string;
  heading?: string;
  body: string[];
  quotes: string[];
  note?: string;
  reference?: string;
  raw: string;
}

export interface TeleprompterSlideSummary {
  id: string;
  heading?: string;
  preview: string;
  reference?: string;
}

export interface TeleprompterSessionState {
  title: string;
  documentId?: string;
  slideIndex: number;
  theme: TeleprompterTheme;
  mode: TeleprompterMode;
  fontScale: number;
  locked: boolean;
  scrolling: boolean;
  scrollSpeed: number;
  scrollTopSequence: number;
  slides: TeleprompterSlideSummary[];
  sequence: number;
  updatedAt: number;
  actorId: string;
}

export type TeleprompterAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "theme"; theme: TeleprompterTheme }
  | { type: "mode"; mode: TeleprompterMode }
  | { type: "fontScale"; fontScale: number }
  | { type: "lock"; locked: boolean }
  | { type: "scroll"; scrolling: boolean }
  | { type: "scrollSpeed"; scrollSpeed: number }
  | { type: "scrollTop" };

export type TeleprompterConnection =
  | "idle"
  | "connecting"
  | "live"
  | "recovering"
  | "offline";
