import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";
import { saveInstagramConfig, verifyAndSubscribeInstagram } from "@/social-messaging";

const automationFields = z.object({
  name: z.string().trim().min(2).max(120),
  triggerType: z.enum(["dm_keyword", "comment_keyword"]),
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  matchType: z.enum(["exact", "contains", "starts_with"]),
  replyText: z.string().trim().min(1).max(900),
  destinationUrl: z.union([z.string().url().max(2000), z.literal("")]).optional(),
  enabled: z.boolean().default(false)
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_automation"), automation: automationFields }),
  z.object({ action: z.literal("update_automation"), id: z.string().uuid(), automation: automationFields }),
  z.object({ action: z.literal("toggle_automation"), id: z.string().uuid(), enabled: z.boolean() }),
  z.object({ action: z.literal("delete_automation"), id: z.string().uuid() }),
  z.object({
    action: z.literal("save_connection"),
    appSecret: z.string().trim().max(500).optional(),
    accessToken: z.string().trim().max(4000).optional(),
    instagramUserId: z.string().trim().max(100).optional(),
    verifyToken: z.string().trim().min(8).max(200).optional(),
    graphVersion: z.string().trim().regex(/^v\d+\.\d+$/).optional()
  }),
  z.object({ action: z.literal("verify_connection") })
]);

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  try {
    const body = parsed.data;
    if (body.action === "create_automation" || body.action === "update_automation") {
      const record = {
        name: body.automation.name,
        platform: "instagram",
        trigger_type: body.automation.triggerType,
        keywords: Array.from(new Set(body.automation.keywords.map((value) => value.trim()).filter(Boolean))),
        match_type: body.automation.matchType,
        reply_text: body.automation.replyText,
        destination_url: body.automation.destinationUrl?.trim() || null,
        enabled: body.automation.enabled,
        created_by: access.user.email,
        updated_at: new Date().toISOString()
      };
      if (body.action === "create_automation") {
        const { data, error } = await service.from("social_automations").insert(record).select("*").single();
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, automation: data });
      }
      const { data, error } = await service.from("social_automations").update(record).eq("id", body.id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, automation: data });
    }

    if (body.action === "toggle_automation") {
      const { error } = await service.from("social_automations").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_automation") {
      const { error } = await service.from("social_automations").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "save_connection") {
      await saveInstagramConfig(body);
      return NextResponse.json({ ok: true });
    }

    const result = await verifyAndSubscribeInstagram();
    return NextResponse.json({ ok: true, connection: result });
  } catch (error) {
    console.error("Social automation operation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Social automation operation failed." }, { status: 502 });
  }
}
