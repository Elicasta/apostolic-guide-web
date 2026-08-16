import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { appPayloadSchemas, type AppEntityType } from "@/app-content-contracts";
import { createServiceClient } from "@/supabase";
import { recordStudioAudit } from "@/studio-audit";

const basePayload = z.record(z.string(), z.unknown());
const requestSchema = z.object({
  sourceContentItemId: z.string().uuid(),
  entityType: z.enum(["scripture", "pathway", "objection", "category"]),
  entityId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  schemaVersion: z.number().int().positive().max(100),
  status: z.enum(["draft", "published", "archived"]),
  payload: basePayload
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });

  const entityType = parsed.data.entityType as AppEntityType;
  const payload = appPayloadSchemas[entityType].safeParse(parsed.data.payload);
  if (!payload.success) {
    const first = payload.error.issues[0];
    const location = first?.path.length ? `${first.path.join(".")}: ` : "";
    return NextResponse.json({ error: `Invalid ${entityType} payload. ${location}${first?.message ?? "Validation failed"}` }, { status: 400 });
  }
  if (payload.data.id !== parsed.data.entityId) {
    return NextResponse.json({ error: "The payload id must match the stable app entity ID." }, { status: 400 });
  }

  // Studio already performed the authorization gate above. Use service access for
  // the database mutation so App Content follows the same permission model as
  // the rest of Admin instead of depending on a second, stale database-role system.
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const { data, error } = await service.schema("app_content").rpc("publish_record_admin", {
    p_source_content_item_id: parsed.data.sourceContentItemId,
    p_entity_type: entityType,
    p_entity_id: parsed.data.entityId,
    p_schema_version: parsed.data.schemaVersion,
    p_status: parsed.data.status,
    p_payload: payload.data,
    p_actor_user_id: access.user.id
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await recordStudioAudit({ actorUserId: access.user.id, action: `app_content.${parsed.data.status}`, resourceType: "content", resourceId: parsed.data.sourceContentItemId, metadata: { entity_type: entityType, entity_id: parsed.data.entityId, status: parsed.data.status, schema_version: parsed.data.schemaVersion, channel: "app" } });
  return NextResponse.json({ record: data });
}
