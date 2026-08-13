import type { StudioCueAction, StudioProgramState } from "./types";

export type StudioActionEnvelope = {
  actionId: string;
  expectedVersion?: number;
  actions: StudioCueAction[];
};

export type StudioActionResult = {
  state: StudioProgramState;
  applied: boolean;
  reason?: "duplicate" | "stale";
  appliedActionIds: string[];
};

export function createInitialProgramState(input: {
  sessionId: string;
  episodeId: string;
  sceneId?: string;
}): StudioProgramState {
  const now = new Date().toISOString();
  return {
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    status: "prepared",
    currentSceneId: input.sceneId ?? "holding",
    activeOverlays: [],
    sourceStates: {},
    updatedAt: now,
    version: 0
  };
}

export function applyStudioActionEnvelope(
  current: StudioProgramState,
  envelope: StudioActionEnvelope,
  previouslyAppliedActionIds: ReadonlySet<string> = new Set()
): StudioActionResult {
  if (previouslyAppliedActionIds.has(envelope.actionId)) {
    return { state: current, applied: false, reason: "duplicate", appliedActionIds: [] };
  }

  if (envelope.expectedVersion !== undefined && envelope.expectedVersion !== current.version) {
    return { state: current, applied: false, reason: "stale", appliedActionIds: [] };
  }

  let next = current;
  const appliedActionIds: string[] = [];

  for (const action of [...envelope.actions].sort((a, b) => a.position - b.position)) {
    next = applyCueAction(next, action);
    appliedActionIds.push(action.id);
  }

  return {
    state: {
      ...next,
      version: current.version + 1,
      updatedAt: new Date().toISOString()
    },
    applied: true,
    appliedActionIds
  };
}

export function applyCueAction(state: StudioProgramState, action: StudioCueAction): StudioProgramState {
  const payload = action.payload;

  switch (action.type) {
    case "scene.set": {
      const sceneId = asString(payload.sceneId);
      return sceneId ? { ...state, currentSceneId: sceneId } : state;
    }
    case "overlay.show": {
      const overlayId = asString(payload.overlayId);
      const overlayType = asOverlayType(payload.overlayType);
      if (!overlayId || !overlayType) return state;
      if (state.activeOverlays.some((overlay) => overlay.id === overlayId)) return state;
      return {
        ...state,
        activeOverlays: [
          ...state.activeOverlays,
          {
            id: overlayId,
            type: overlayType,
            assetId: asString(payload.assetId),
            layer: asNumber(payload.layer) ?? 50,
            enteredAt: new Date().toISOString(),
            config: asRecord(payload.config)
          }
        ]
      };
    }
    case "overlay.hide": {
      const overlayId = asString(payload.overlayId);
      if (!overlayId) return state;
      return { ...state, activeOverlays: state.activeOverlays.filter((overlay) => overlay.id !== overlayId) };
    }
    case "overlay.clear":
      return { ...state, activeOverlays: [] };
    case "scripture.load":
      return { ...state, activeScriptureId: asString(payload.assetId) ?? state.activeScriptureId };
    case "question.load":
      return { ...state, activeQuestionId: asString(payload.assetId) ?? state.activeQuestionId };
    case "poll.open":
      return { ...state, activePollId: asString(payload.assetId) ?? state.activePollId };
    case "poll.close":
      return { ...state, activePollId: undefined };
    case "media.play": {
      const assetId = asString(payload.assetId);
      if (!assetId) return state;
      return {
        ...state,
        activeMedia: {
          assetId,
          state: "playing",
          startedAt: new Date().toISOString(),
          returnSceneId: asString(payload.returnSceneId),
          autoAdvanceCue: asBoolean(payload.autoAdvanceCue)
        }
      };
    }
    case "media.stop":
      return { ...state, activeMedia: undefined };
    case "program.clear":
      return { ...state, activeOverlays: [], activeMedia: undefined, activeQuestionId: undefined, activePollId: undefined };
    default:
      return state;
  }
}

export function shouldAcceptIncomingState(currentVersion: number, incomingVersion: number) {
  return incomingVersion > currentVersion;
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asOverlayType(value: unknown): StudioProgramState["activeOverlays"][number]["type"] | undefined {
  return value === "lower_third" || value === "question" || value === "scripture_reference" || value === "title" || value === "cta" || value === "poll" || value === "custom" ? value : undefined;
}
