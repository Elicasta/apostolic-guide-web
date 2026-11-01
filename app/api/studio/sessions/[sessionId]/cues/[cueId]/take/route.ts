import { NextResponse } from "next/server";
import { getAdminAccess } from "@/auth";
import { applyStudioActionEnvelope } from "@/studio/program-state";
import { getAppliedActionIds, getSession, logProductionEvent, saveSessionState, StudioPersistenceError } from "@/studio/repository";
import { getCueForSession, getRunCues } from "@/studio/run-repository";
import type { StudioCueAction } from "@/studio/types";

export async function POST(_request: Request, context: { params: Promise<{ sessionId: string; cueId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user?.id || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { sessionId, cueId } = await context.params;

  try {
    const [snapshot, cue] = await Promise.all([getSession(sessionId), getCueForSession(sessionId, cueId)]);
    if (!snapshot?.state || !snapshot.session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!cue || !cue.enabled) return NextResponse.json({ error: "Cue not found or disabled" }, { status: 404 });

    const runCues = await getRunCues(snapshot.session.active_run_id);
    const activeCues = runCues.filter((item) => item.enabled);
    const cueIndex = activeCues.findIndex((item) => item.id === cue.id);
    const nextCueId = cueIndex >= 0 ? activeCues[cueIndex + 1]?.id : undefined;
    const actionId = `cue:${cue.id}:v${snapshot.state.version}`;
    const previouslyApplied = await getAppliedActionIds(sessionId);
    const actions: StudioCueAction[] = [...(cue.studio_cue_actions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ id: item.id, cueId: cue.id, position: item.position, type: item.action_type as StudioCueAction["type"], payload: item.payload ?? {} }));

    const result = actions.length
      ? applyStudioActionEnvelope(snapshot.state, { actionId, expectedVersion: snapshot.state.version, actions }, previouslyApplied)
      : { state: snapshot.state, applied: true, appliedActionIds: [] as string[] };

    if (!result.applied) return NextResponse.json({ state: snapshot.state, applied: false, reason: result.reason }, { status: result.reason === "stale" ? 409 : 200 });

    const nextState = {
      ...result.state,
      status: "active" as const,
      currentCueId: cue.id,
      nextCueId,
      sessionStartedAt: result.state.sessionStartedAt ?? new Date().toISOString()
    };
    const saved = await saveSessionState(sessionId, nextState, snapshot.stateVersion);
    await logProductionEvent({ sessionId, actorId: access.user.id, eventType: "CUE_TAKEN", cueId: cue.id, actionId, payload: { label: cue.label, nextCueId, actions: actions.map((item) => item.type), version: saved.version } });
    return NextResponse.json({ state: saved, cue, nextCueId, applied: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to take cue";
    if (message.includes("another controller")) return NextResponse.json({ error: message }, { status: 409 });
    return NextResponse.json({ error: message }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
