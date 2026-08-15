import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { deleteCommentGuideJob, retryCommentGuideJob, sendCommentGuideJobNow, simulateInstagramCommentGuide, updateCommentGuideSettings } from "@/comment-guide-runtime";
import { recordStudioAudit } from "@/studio-audit";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_settings"),
    mode: z.enum(["paused", "shadow", "live"]),
    positiveRepliesEnabled: z.boolean(),
    publicKeywordAckEnabled: z.boolean(),
    dailyReplyLimit: z.number().int().min(1).max(5000)
  }),
  z.object({ action: z.literal("simulate"), comment: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal("retry_job"), jobId: z.number().int().positive() }),
  z.object({ action: z.literal("send_now"), jobId: z.number().int().positive() }),
  z.object({ action: z.literal("delete_job"), jobId: z.number().int().positive() })
]);

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid Comment Guide request." }, { status: 400 });

  try {
    if (parsed.data.action === "simulate") {
      const simulation = await simulateInstagramCommentGuide(parsed.data.comment);
      await recordStudioAudit({ actorUserId: access.user.id, action: "comment_guide.simulated", resourceType: "comment_guide", metadata: { intent: simulation.decision.intent, action: simulation.decision.action, pathway_slug: simulation.decision.pathwaySlug, explicit_keyword_gate: Boolean(simulation.explicitKeywordGate) } });
      return NextResponse.json({ ok: true, simulation });
    }
    if (parsed.data.action === "retry_job") {
      const retry = await retryCommentGuideJob(parsed.data.jobId);
      await recordStudioAudit({ actorUserId: access.user.id, action: "comment_guide.retried", resourceType: "social_comment_guide_job", resourceId: String(parsed.data.jobId), metadata: { status: retry.status } });
      return NextResponse.json({ ok: true, retry });
    }
    if (parsed.data.action === "send_now") {
      const delivery = await sendCommentGuideJobNow(parsed.data.jobId);
      await recordStudioAudit({ actorUserId: access.user.id, action: "comment_guide.sent_now", resourceType: "social_comment_guide_job", resourceId: String(parsed.data.jobId), metadata: { status: delivery.status } });
      return NextResponse.json({ ok: true, delivery });
    }
    if (parsed.data.action === "delete_job") {
      const deleted = await deleteCommentGuideJob(parsed.data.jobId);
      await recordStudioAudit({ actorUserId: access.user.id, action: "comment_guide.job_deleted", resourceType: "social_comment_guide_job", resourceId: String(parsed.data.jobId), metadata: { prior_status: deleted.status } });
      return NextResponse.json({ ok: true, deleted });
    }
    const settings = await updateCommentGuideSettings({
      mode: parsed.data.mode,
      positiveRepliesEnabled: parsed.data.positiveRepliesEnabled,
      publicKeywordAckEnabled: parsed.data.publicKeywordAckEnabled,
      dailyReplyLimit: parsed.data.dailyReplyLimit,
      updatedBy: access.user.email
    });
    await recordStudioAudit({ actorUserId: access.user.id, action: "comment_guide.settings_updated", resourceType: "comment_guide", metadata: settings });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("Comment Guide admin operation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Comment Guide operation failed." }, { status: 502 });
  }
}
