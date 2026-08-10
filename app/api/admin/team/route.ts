import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { recordStudioAudit } from "@/studio-audit";
import { changeStudioMemberRole, inviteStudioMember, removeStudioMember } from "@/studio-roles";
import { normalizeStudioRole } from "@/studio-permissions";

const roleSchema = z.enum(["owner", "admin", "editor", "moderator", "viewer"]);
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.string().trim().email().max(320), role: roleSchema }),
  z.object({ action: z.literal("role"), memberId: z.string().uuid(), role: roleSchema }),
  z.object({ action: z.literal("remove"), memberId: z.string().uuid() })
]);

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_team");
  if (!allowed || access.state !== "allowed" || !access.user || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid team request." }, { status: 400 });
  const actorRole = normalizeStudioRole(access.role);
  if (!actorRole) return NextResponse.json({ error: "Studio role is invalid." }, { status: 403 });

  try {
    if (parsed.data.action === "invite") {
      const userId = await inviteStudioMember({ email: parsed.data.email, role: parsed.data.role, invitedBy: access.user.id, actorRole });
      await recordStudioAudit({ actorUserId: access.user.id, action: "team.member_invited", resourceType: "studio_member", resourceId: userId, metadata: { email: parsed.data.email.toLowerCase(), role: parsed.data.role } });
      return NextResponse.json({ ok: true, userId });
    }
    if (parsed.data.action === "role") {
      await changeStudioMemberRole({ memberId: parsed.data.memberId, role: parsed.data.role, actorUserId: access.user.id, actorRole });
      await recordStudioAudit({ actorUserId: access.user.id, action: "team.role_changed", resourceType: "studio_member", resourceId: parsed.data.memberId, metadata: { role: parsed.data.role } });
      return NextResponse.json({ ok: true });
    }
    await removeStudioMember({ memberId: parsed.data.memberId, actorUserId: access.user.id, actorRole });
    await recordStudioAudit({ actorUserId: access.user.id, action: "team.member_removed", resourceType: "studio_member", resourceId: parsed.data.memberId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Team access update failed." }, { status: 400 });
  }
}
