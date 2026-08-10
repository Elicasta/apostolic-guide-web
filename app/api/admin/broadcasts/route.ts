import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createBroadcastDraft, sendBroadcastDraft, sendBroadcastTest } from "@/resend-broadcasts";
import { recordStudioAudit } from "@/studio-audit";

const campaignSchema = z.object({
  type: z.enum(["article", "topic", "answer", "pathway", "youtube", "podcast", "announcement"]),
  subject: z.string().trim().min(3).max(180),
  previewText: z.string().trim().min(3).max(220),
  eyebrow: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(220),
  summary: z.string().trim().min(10).max(1200),
  ctaLabel: z.string().trim().min(2).max(60),
  url: z.string().url().max(2000)
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), audience: z.enum(["general", "content", "media"]), campaign: campaignSchema }),
  z.object({ action: z.literal("send"), broadcastId: z.string().uuid() }),
  z.object({ action: z.literal("test"), campaign: campaignSchema })
]);

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid campaign request." }, { status: 400 });

  try {
    if (parsed.data.action === "create") {
      const result = await createBroadcastDraft({ campaign: parsed.data.campaign, audience: parsed.data.audience, createdBy: access.user.email });
      await recordStudioAudit({ actorUserId: access.user.id, action: "broadcast.created", resourceType: "broadcast", resourceId: result.id, metadata: { title: parsed.data.campaign.title, kind: parsed.data.campaign.type, audience: parsed.data.audience, status: "draft" } });
      return NextResponse.json({ ok: true, broadcastId: result.id, campaignId: result.campaignId, status: "draft" });
    }
    if (parsed.data.action === "send") {
      const result = await sendBroadcastDraft(parsed.data.broadcastId);
      await recordStudioAudit({ actorUserId: access.user.id, action: "broadcast.sent", resourceType: "broadcast", resourceId: parsed.data.broadcastId, metadata: { status: "sending" } });
      return NextResponse.json({ ok: true, broadcastId: result.id, status: "sending" });
    }
    const result = await sendBroadcastTest({ campaign: parsed.data.campaign, to: access.user.email });
    await recordStudioAudit({ actorUserId: access.user.id, action: "broadcast.test_sent", resourceType: "broadcast", metadata: { title: parsed.data.campaign.title, kind: parsed.data.campaign.type, sent_to: access.user.email } });
    return NextResponse.json({ ok: true, emailId: result.id ?? null, sentTo: access.user.email });
  } catch (error) {
    console.error("Broadcast operation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Broadcast operation failed." }, { status: 502 });
  }
}
