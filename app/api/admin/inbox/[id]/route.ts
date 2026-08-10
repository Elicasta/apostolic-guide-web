import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { sendManualInstagramReply, updateConversationStatus } from "@/inbox";
import { recordStudioAudit } from "@/studio-audit";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(10000) }),
  z.object({ action: z.literal("status"), status: z.enum(["open","follow_up","resolved","archived"]) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_inbox");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  try {
    if (parsed.data.action === "reply") {
      const messageId = await sendManualInstagramReply(id, parsed.data.body);
      await recordStudioAudit({ actorUserId: access.user.id, action: "inbox.reply_sent", resourceType: "inbox_conversation", resourceId: id, metadata: { message_id: messageId, body_length: parsed.data.body.length, channel: "instagram" } });
      return NextResponse.json({ ok: true, messageId });
    }
    await updateConversationStatus(id, parsed.data.status);
    await recordStudioAudit({ actorUserId: access.user.id, action: "inbox.status_changed", resourceType: "inbox_conversation", resourceId: id, metadata: { status: parsed.data.status } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox action failed." }, { status: 400 });
  }
}
