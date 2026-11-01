import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeSolCurrentRuns,
  solProposalCoveredByReviewRuns,
  solTeamRunIsActive,
  solTeamRunNeedsAttention
} from "../src/sol-agent-team-engine";

test("manager hides completed history and collapses duplicate current work", () => {
  const runs = dedupeSolCurrentRuns([
    { recipeKey: "audio_to_youtube", pathwaySlug: "word-became-flesh", status: "waiting_review", updatedAt: "2026-08-20T01:00:00Z", id: "new" },
    { recipeKey: "audio_to_youtube", pathwaySlug: "word-became-flesh", status: "waiting_review", updatedAt: "2026-08-18T01:00:00Z", id: "old" },
    { recipeKey: "audio_to_youtube", pathwaySlug: "god-alone-creator", status: "completed", updatedAt: "2026-08-17T01:00:00Z", id: "done" },
    { recipeKey: "pathway_audio_stage", pathwaySlug: "jesus-is-god", status: "running", updatedAt: "2026-08-20T01:10:00Z", id: "active" }
  ]);

  assert.deepEqual(runs.map((run) => run.id), ["new", "active"]);
});

test("active and attention states are explicit", () => {
  assert.equal(solTeamRunIsActive("queued"), true);
  assert.equal(solTeamRunIsActive("retrying"), true);
  assert.equal(solTeamRunIsActive("waiting_review"), false);
  assert.equal(solTeamRunNeedsAttention("waiting_review"), true);
  assert.equal(solTeamRunNeedsAttention("failed"), true);
  assert.equal(solTeamRunNeedsAttention("completed"), false);
});

test("a pending proposal is suppressed when every pathway already has that recipe at review", () => {
  const covered = solProposalCoveredByReviewRuns(
    { recipeKey: "audio_to_youtube", pathwaySlugs: ["god-alone-creator", "word-became-flesh"] },
    [
      { recipeKey: "audio_to_youtube", pathwaySlug: "god-alone-creator", status: "waiting_review" },
      { recipeKey: "audio_to_youtube", pathwaySlug: "word-became-flesh", status: "waiting_review" }
    ]
  );
  assert.equal(covered, true);
});

test("a proposal remains current if any pathway still lacks review work", () => {
  const covered = solProposalCoveredByReviewRuns(
    { recipeKey: "audio_to_youtube", pathwaySlugs: ["god-alone-creator", "word-became-flesh"] },
    [
      { recipeKey: "audio_to_youtube", pathwaySlug: "god-alone-creator", status: "waiting_review" },
      { recipeKey: "audio_to_youtube", pathwaySlug: "word-became-flesh", status: "completed" }
    ]
  );
  assert.equal(covered, false);
});

test("review work for another recipe does not suppress a proposal", () => {
  const covered = solProposalCoveredByReviewRuns(
    { recipeKey: "audio_to_youtube", pathwaySlugs: ["god-alone-creator"] },
    [{ recipeKey: "pathway_audio_stage", pathwaySlug: "god-alone-creator", status: "waiting_review" }]
  );
  assert.equal(covered, false);
});
