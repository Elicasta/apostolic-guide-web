import { createServiceClient } from "./supabase";
import { normalizeStudioRole, type StudioRole } from "./studio-permissions";

export type StudioMember = {
  id: string;
  user_id: string;
  email: string;
  role: StudioRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string | null;
};

export async function listStudioMembers() {
  const service = createServiceClient();
  if (!service) return [] as StudioMember[];
  const { data } = await service.from("studio_members").select("*").order("created_at");
  if (!data?.length) return [] as StudioMember[];
  const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byId = new Map((users?.users ?? []).map((user) => [user.id, user]));
  return data.map((row) => ({ ...row, role: normalizeStudioRole(row.role) ?? "viewer", last_sign_in_at: byId.get(row.user_id)?.last_sign_in_at ?? null })) as StudioMember[];
}

export async function inviteStudioMember(input: { email: string; role: StudioRole; invitedBy: string; actorRole: StudioRole }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  if (input.actorRole !== "owner" && input.role === "owner") throw new Error("Only an owner can create another owner.");
  const email = input.email.trim().toLowerCase();
  const existing = await service.from("studio_members").select("user_id,email,role").eq("email", email).maybeSingle();
  if (existing.data) throw new Error("This email is already a Studio member.");

  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = listed.data?.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
  if (!user) {
    const invited = await service.auth.admin.inviteUserByEmail(email);
    if (invited.error || !invited.data.user) throw new Error(invited.error?.message ?? "Could not invite this email.");
    user = invited.data.user;
  }

  const { error } = await service.from("studio_members").insert({ user_id: user.id, email, role: input.role, invited_by: input.invitedBy });
  if (error) throw new Error(error.message);
  return user.id;
}

export async function changeStudioMemberRole(input: { memberId: string; role: StudioRole; actorUserId: string; actorRole: StudioRole }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { data: target } = await service.from("studio_members").select("id,user_id,role").eq("id", input.memberId).single();
  if (!target) throw new Error("Studio member not found.");
  const targetRole = normalizeStudioRole(target.role) ?? "viewer";
  if (input.actorRole !== "owner" && (targetRole === "owner" || input.role === "owner")) throw new Error("Only an owner can change owner access.");
  if (target.user_id === input.actorUserId && targetRole === "owner" && input.role !== "owner") {
    const owners = await service.from("studio_members").select("id", { count: "exact", head: true }).eq("role", "owner");
    if ((owners.count ?? 0) <= 1) throw new Error("The workspace must keep at least one owner.");
  }
  const { error } = await service.from("studio_members").update({ role: input.role, updated_at: new Date().toISOString() }).eq("id", input.memberId);
  if (error) throw new Error(error.message);
}

export async function removeStudioMember(input: { memberId: string; actorUserId: string; actorRole: StudioRole }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const { data: target } = await service.from("studio_members").select("id,user_id,role").eq("id", input.memberId).single();
  if (!target) throw new Error("Studio member not found.");
  const targetRole = normalizeStudioRole(target.role) ?? "viewer";
  if (input.actorRole !== "owner" && targetRole === "owner") throw new Error("Only an owner can remove an owner.");
  if (target.user_id === input.actorUserId) throw new Error("You cannot remove your own Studio membership.");
  if (targetRole === "owner") {
    const owners = await service.from("studio_members").select("id", { count: "exact", head: true }).eq("role", "owner");
    if ((owners.count ?? 0) <= 1) throw new Error("The workspace must keep at least one owner.");
  }
  const { error } = await service.from("studio_members").delete().eq("id", input.memberId);
  if (error) throw new Error(error.message);
}
