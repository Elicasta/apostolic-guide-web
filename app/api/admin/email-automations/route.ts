import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { getWelcomeAutomation, sendWelcomeTest } from "@/email-automations";
import { welcomeCopySchema } from "@/welcome-automation-config";
import { recordStudioAudit } from "@/studio-audit";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), revision: z.number().int().positive(), status: z.enum(["active","paused"]), copy: welcomeCopySchema }),
  z.object({ action: z.literal("test"), copy: welcomeCopySchema })
]);

export async function GET() {
  const permission = await getStudioPermission("view_distribution");
  if (!permission.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getWelcomeAutomation(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const permission = await getStudioPermission("manage_distribution");
  if (!permission.allowed || permission.access.state !== "allowed" || !permission.access.user?.email)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid settings." }, { status: 400 });
  const input = parsed.data;
  const settings = await getWelcomeAutomation();
  if (!settings.available) return NextResponse.json({ error: "Email automation tables unavailable. Apply the migration first." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Email automation database unavailable." }, { status: 503 });
  if (input.action === "test") {
    try {
      const emailId = await sendWelcomeTest(permission.access.user.email, input.copy);
      await recordStudioAudit({ actorUserId: permission.access.user.id, action: "email_automation.welcome_test", resourceType: "email_automation", resourceId: null, metadata: { email_id: emailId } });
      return NextResponse.json({ ok: true, message: "Test email sent to your Studio account.", emailId });
    } catch {
      return NextResponse.json({ error: "Resend could not send the test. Check its sender configuration." }, { status: 502 });
    }
  }

  if (input.status === "active" && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL))
    return NextResponse.json({ error: "Configure Resend before activating welcome emails." }, { status: 409 });
  const { data, error } = await service.from("email_automations")
    .update({ status: input.status, copy: input.copy, revision: input.revision + 1, updated_by: permission.access.user.id, updated_at: new Date().toISOString() })
    .eq("key", "welcome").eq("revision", input.revision).select("revision").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save automation." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Another editor changed this automation. Refresh before saving." }, { status: 409 });
  await recordStudioAudit({ actorUserId: permission.access.user.id, action: "email_automation.welcome_saved", resourceType: "email_automation", metadata: { status: input.status, revision: data.revision } });
  return NextResponse.json({ ok: true, revision: data.revision });
}
