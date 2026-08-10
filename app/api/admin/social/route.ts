import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { createServiceClient } from "@/supabase";
import { saveInstagramConfig, verifyAndSubscribeInstagram } from "@/social-messaging";
import { recordStudioAudit } from "@/studio-audit";

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
  if (access.state !== "allowed" || !access.user?.email || !access.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const connectionAction = parsed.data.action === "save_connection" || parsed.data.action === "verify_connection";
  const permission = connectionAction ? "manage_integrations" : "manage_distribution";
  if (!hasStudioPermission(access.role, permission)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
        await recordStudioAudit({ actorUserId: access.user.id, action: "social.automation_created", resourceType: "social_automation", resourceId: data.id, metadata: { name: body.automation.name, trigger_type: body.automation.triggerType, match_type: body.automation.matchType, keyword_count: record.keywords.length, enabled: body.automation.enabled } });
        return NextResponse.json({ ok: true, automation: data });
      }
      const { data, error } = await service.from("social_automations").update(record).eq("id", body.id).select("*").single();
      if (error) throw new Error(error.message);
      await recordStudioAudit({ actorUserId: access.user.id, action: "social.automation_updated", resourceType: "social_automation", resourceId: body.id, metadata: { name: body.automation.name, trigger_type: body.automation.triggerType, match_type: body.automation.matchType, keyword_count: record.keywords.length, enabled: body.automation.enabled } });
      return NextResponse.json({ ok: true, automation: data });
    }

    if (body.action === "toggle_automation") {
      const { error } = await service.from("social_automations").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw new Error(error.message);
      await recordStudioAudit({ actorUserId: access.user.id, action: "social.automation_toggled", resourceType: "social_automation", resourceId: body.id, metadata: { enabled: body.enabled } });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete_automation") {
      const { error } = await service.from("social_automations").delete().eq("id", body.id);
      if (error) throw new Error(error.message);
      await recordStudioAudit({ actorUserId: access.user.id, action: "social.automation_deleted", resourceType: "social_automation", resourceId: body.id });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "save_connection") {
      await saveInstagramConfig(body);
      await recordStudioAudit({ actorUserId: access.user.id, action: "social.connection_saved", resourceType: "integration", metadata: { platform: "instagram", instagram_user_id: body.instagramUserId || null, graph_version: body.graphVersion || null, app_secret_updated: Boolean(body.appSecret), access_token_updated: Boolean(body.accessToken), verify_token_updated: Boolean(body.verifyToken) } });
      return NextResponse.json({ ok: true });
    }

    const result = await verifyAndSubscribeInstagram();
    await recordStudioAudit({ actorUserId: access.user.id, action: "social.connection_verified", resourceType: "integration", metadata: { platform: "instagram", instagram_user_id: result.instagramUserId, username: result.username, webhook_subscribed: result.webhookSubscribed } });
    return NextResponse.json({ ok: true, connection: result });
  } catch (error) {
    console.error("Social automation operation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Social automation operation failed." }, { status: 502 });
  }
}
