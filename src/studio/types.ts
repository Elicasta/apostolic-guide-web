export type StudioEpisodeType = "solo" | "interview" | "panel" | "live_qa";
export type StudioEpisodeStatus = "draft" | "prepared" | "green_room" | "active" | "ended" | "archived";
export type StudioAccessMode = "public" | "account" | "members" | "private";

export type StudioAssetType =
  | "scripture"
  | "question"
  | "talking_point"
  | "lower_third"
  | "title"
  | "quote"
  | "cta"
  | "pathway"
  | "video"
  | "audio"
  | "image"
  | "poll"
  | "custom_text";

export type StudioCueActionType =
  | "scene.set"
  | "overlay.show"
  | "overlay.hide"
  | "overlay.clear"
  | "media.play"
  | "media.stop"
  | "scripture.load"
  | "question.load"
  | "poll.open"
  | "poll.close"
  | "poll.results.show"
  | "poll.results.hide"
  | "lower_third.show"
  | "lower_third.hide"
  | "program.clear"
  | "marker.create"
  | "timer.start"
  | "timer.reset"
  | "note"
  | "wait";

export type StudioCueStatus = "upcoming" | "ready" | "live" | "complete" | "skipped" | "failed";

export interface StudioEpisode {
  id: string;
  title: string;
  slug: string;
  type: StudioEpisodeType;
  status: StudioEpisodeStatus;
  accessMode: StudioAccessMode;
  seriesId?: string;
  scheduledAt?: string;
  expectedDurationMinutes?: number;
  notes?: string;
  youtubeUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioEpisodePathway {
  id: string;
  episodeId: string;
  pathwayId: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface StudioAsset {
  id: string;
  episodeId: string;
  type: StudioAssetType;
  sourceType?: string;
  sourceId?: string;
  snapshotData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
  label?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioRunOfShow {
  id: string;
  episodeId: string;
  name: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudioCue {
  id: string;
  runOfShowId: string;
  position: number;
  label: string;
  assetId?: string;
  presenterNotes?: string;
  estimatedDurationSeconds?: number;
  autoAdvance?: boolean;
  autoAdvanceDelayMs?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudioCueAction {
  id: string;
  cueId: string;
  position: number;
  type: StudioCueActionType;
  payload: Record<string, unknown>;
}

export interface StudioProgramState {
  sessionId: string;
  episodeId: string;
  status: "idle" | "prepared" | "active" | "ended";
  currentSceneId: string;
  currentCueId?: string;
  nextCueId?: string;
  activeScriptureId?: string;
  activeQuestionId?: string;
  activePollId?: string;
  activeOverlays: Array<{
    id: string;
    type: "lower_third" | "question" | "scripture_reference" | "title" | "cta" | "poll" | "custom";
    assetId?: string;
    layer: number;
    enteredAt: string;
    config?: Record<string, unknown>;
  }>;
  activeMedia?: {
    assetId: string;
    state: "loading" | "playing" | "paused" | "ended" | "failed";
    startedAt?: string;
    returnSceneId?: string;
    autoAdvanceCue?: boolean;
  };
  sourceStates: Record<string, { state: "unavailable" | "connecting" | "ready" | "active" | "failed" }>;
  sessionStartedAt?: string;
  liveStartedAt?: string;
  updatedAt: string;
  version: number;
}

export interface StudioEpisodeRecommendation {
  id: string;
  title: string;
  reason: string;
  priority: "low" | "medium" | "high";
  primaryPathwayId: string;
  supportingPathwayIds: string[];
  signals: string[];
  suggestedDurationMinutes?: number;
}

export interface StudioLiveQuestion {
  id: string;
  episodeId: string;
  userId: string;
  displayName?: string;
  anonymousToAudience: boolean;
  body: string;
  status: "submitted" | "approved" | "queued" | "live" | "answered" | "dismissed";
  votes: number;
  createdAt: string;
}

export interface StudioPoll {
  id: string;
  episodeId: string;
  question: string;
  status: "draft" | "scheduled" | "open" | "closed" | "archived";
  allowAnswerChange: boolean;
  showResults: boolean;
  options: Array<{ id: string; label: string }>;
  createdAt: string;
}

export interface StudioMembership {
  userId: string;
  accountStatus: "active" | "disabled";
  membershipTier?: string;
  entitlements: string[];
}
