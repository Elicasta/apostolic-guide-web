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
  slides: TeleprompterSlideSummary[];
}

export type TeleprompterCommand =
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "theme"; theme: TeleprompterTheme }
  | { type: "mode"; mode: TeleprompterMode }
  | { type: "fontScale"; fontScale: number }
  | { type: "lock"; locked: boolean };
