import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { sendManualInstagramReply, updateConversationStatus } from "@/inbox";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(1).max(10000) }),
  z.object({ action: z.literal("status"), status: z.enum(["open","follow_up","resolved","archived"]) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" && access.state !== "unconfigured") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  try {
    if (parsed.data.action === "reply") {
      const messageId = await sendManualInstagramReply(id, parsed.data.body);
      return NextResponse.json({ ok: true, messageId });
    }
    await updateConversationStatus(id, parsed.data.status);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox action failed." }, { status: 400 });
  }
}
