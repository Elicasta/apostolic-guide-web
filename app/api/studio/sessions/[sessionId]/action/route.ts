import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { applyStudioActionEnvelope } from "@/studio/program-state";
import { getAppliedActionIds, getSession, logProductionEvent, saveSessionState, StudioPersistenceError } from "@/studio/repository";

const ActionSchema = z.object({
  actionId: z.string().min(8).max(200),
  expectedVersion: z.number().int().nonnegative(),
  cueId: z.string().uuid().optional(),
  actions: z.array(z.object({
    id: z.string().min(1),
    cueId: z.string().min(1),
    position: z.number().int(),
    type: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({})
  })).min(1).max(20)
});

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user?.id || !["owner", "admin", "editor"].includes(access.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { sessionId } = await context.params;
  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid production action", issues: parsed.error.flatten() }, { status: 400 });

  try {
    const snapshot = await getSession(sessionId);
    if (!snapshot?.state) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const appliedIds = await getAppliedActionIds(sessionId);
    const result = applyStudioActionEnvelope(snapshot.state, {
      actionId: parsed.data.actionId,
      expectedVersion: parsed.data.expectedVersion,
      actions: parsed.data.actions as never
    }, appliedIds);

    if (!result.applied) {
      return NextResponse.json({ state: snapshot.state, applied: false, reason: result.reason }, { status: result.reason === "stale" ? 409 : 200 });
    }

    const saved = await saveSessionState(sessionId, { ...result.state, currentCueId: parsed.data.cueId ?? result.state.currentCueId }, snapshot.stateVersion);
    await logProductionEvent({
      sessionId,
      actorId: access.user.id,
      eventType: "ACTION_APPLIED",
      cueId: parsed.data.cueId,
      actionId: parsed.data.actionId,
      payload: { actions: parsed.data.actions.map((item) => item.type), version: saved.version }
    });
    return NextResponse.json({ state: saved, applied: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply action";
    if (message.includes("another controller")) return NextResponse.json({ error: message }, { status: 409 });
    return NextResponse.json({ error: message }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
