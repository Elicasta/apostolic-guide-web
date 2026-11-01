import assert from "node:assert/strict";
import test from "node:test";
import { applyStudioActionEnvelope, createInitialProgramState, shouldAcceptIncomingState } from "../src/studio/program-state";
import type { StudioCueAction } from "../src/studio/types";

function action(id: string, position: number, type: StudioCueAction["type"], payload: Record<string, unknown>): StudioCueAction {
  return { id, cueId: "cue-1", position, type, payload };
}

test("scene and overlay actions apply in cue order", () => {
  const initial = createInitialProgramState({ sessionId: "session-1", episodeId: "episode-1" });
  const result = applyStudioActionEnvelope(initial, {
    actionId: "take-1",
    expectedVersion: 0,
    actions: [
      action("overlay", 2, "overlay.show", { overlayId: "host-lower", overlayType: "lower_third", layer: 20 }),
      action("scene", 1, "scene.set", { sceneId: "host-full" })
    ]
  });

  assert.equal(result.applied, true);
  assert.equal(result.state.currentSceneId, "host-full");
  assert.equal(result.state.activeOverlays.length, 1);
  assert.equal(result.state.activeOverlays[0]?.id, "host-lower");
  assert.equal(result.state.version, 1);
});

test("showing an already visible overlay is idempotent", () => {
  const initial = createInitialProgramState({ sessionId: "session-1", episodeId: "episode-1" });
  const first = applyStudioActionEnvelope(initial, {
    actionId: "take-1",
    actions: [action("overlay-1", 1, "overlay.show", { overlayId: "question", overlayType: "question" })]
  });
  const second = applyStudioActionEnvelope(first.state, {
    actionId: "take-2",
    actions: [action("overlay-2", 1, "overlay.show", { overlayId: "question", overlayType: "question" })]
  });

  assert.equal(second.state.activeOverlays.length, 1);
  assert.equal(second.state.activeOverlays[0]?.id, "question");
});

test("duplicate envelopes do not execute twice", () => {
  const initial = createInitialProgramState({ sessionId: "session-1", episodeId: "episode-1" });
  const result = applyStudioActionEnvelope(
    initial,
    { actionId: "take-1", actions: [action("scene", 1, "scene.set", { sceneId: "host-full" })] },
    new Set(["take-1"])
  );

  assert.equal(result.applied, false);
  assert.equal(result.reason, "duplicate");
  assert.equal(result.state.version, 0);
  assert.equal(result.state.currentSceneId, "holding");
});

test("stale expected versions are rejected", () => {
  const initial = { ...createInitialProgramState({ sessionId: "session-1", episodeId: "episode-1" }), version: 4 };
  const result = applyStudioActionEnvelope(initial, {
    actionId: "take-2",
    expectedVersion: 3,
    actions: [action("scene", 1, "scene.set", { sceneId: "black" })]
  });

  assert.equal(result.applied, false);
  assert.equal(result.reason, "stale");
  assert.equal(result.state.currentSceneId, "holding");
  assert.equal(result.state.version, 4);
});

test("older incoming realtime state is ignored", () => {
  assert.equal(shouldAcceptIncomingState(10, 9), false);
  assert.equal(shouldAcceptIncomingState(10, 10), false);
  assert.equal(shouldAcceptIncomingState(10, 11), true);
});
