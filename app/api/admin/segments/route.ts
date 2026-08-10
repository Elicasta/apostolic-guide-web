import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";

const ruleSchema = z.object({
  segment_key: z.string().trim().min(1).max(200),
  negate: z.boolean().default(false)
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().default(""),
    match_mode: z.enum(["all", "any"]),
    rules: z.array(ruleSchema).min(1).max(20)
  }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() })
]);

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  if (parsed.data.action === "delete") {
    const { error } = await service.from("custom_segments").delete().eq("id", parsed.data.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const payload = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    match_mode: parsed.data.match_mode,
    rules: parsed.data.rules,
    updated_at: new Date().toISOString(),
    created_by: access.user.email
  };

  if (parsed.data.id) {
    const { error } = await service.from("custom_segments").update(payload).eq("id", parsed.data.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: parsed.data.id });
  }

  const { data, error } = await service.from("custom_segments").insert(payload).select("id").single();
  if (error || !data?.id) return NextResponse.json({ error: error?.message ?? "Could not save segment." }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
