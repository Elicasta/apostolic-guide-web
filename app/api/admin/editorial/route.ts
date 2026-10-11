import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { editorialSnapshot, prepareEditorialWindow, setEditorialEnabled } from "@/editorial-engine-server";
import { recordStudioAudit } from "@/studio-audit";
import { z } from "zod";

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await editorialSnapshot()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Editorial storage unavailable." }, { status: 503 }); }
}
const schema = z.discriminatedUnion("action", [z.object({ action: z.literal("prepare") }), z.object({ action: z.literal("configure"), enabled: z.boolean() })]);
export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid editorial action." }, { status: 400 });
  try {
    const result = parsed.data.action === "prepare" ? await prepareEditorialWindow() : await setEditorialEnabled(parsed.data.enabled);
    await recordStudioAudit({ actorUserId: access.user.id, action: `editorial.${parsed.data.action}`, resourceType: "editorial_engine", metadata: result });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Editorial action failed." }, { status: 503 }); }
}
