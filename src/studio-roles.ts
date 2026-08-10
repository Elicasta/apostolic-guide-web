import { createServiceClient } from "./supabase";

export type StudioRole = "owner" | "admin" | "editor" | "moderator" | "viewer";
export type StudioPermission =
  | "view_workspace"
  | "view_people"
  | "manage_people"
  | "view_inbox"
  | "manage_inbox"
  | "view_journeys"
  | "manage_journeys"
  | "view_segments"
  | "manage_segments"
  | "view_content"
  | "manage_content"
  | "view_distribution"
  | "manage_distribution"
  | "view_analytics"
  | "view_notifications"
  | "view_health"
  | "manage_integrations"
  | "manage_team";

export const STUDIO_ROLE_LABELS: Record<StudioRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  moderator: "Moderator",
  viewer: "Viewer"
};

export const STUDIO_ROLE_DESCRIPTIONS: Record<StudioRole, string> = {
  owner: "Full control, including team roles and integrations.",
  admin: "Full day-to-day administration, including team management.",
  editor: "Publish and manage website/app content and distribution.",
  moderator: "Manage people, Inbox follow-up, segments, and journeys.",
  viewer: "Read-only access to workspace, people, and analytics."
};

const ROLE_PERMISSIONS: Record<StudioRole, StudioPermission[]> = {
  owner: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications","view_health","manage_integrations","manage_team"],
  admin: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications","view_health","manage_integrations","manage_team"],
  editor: ["view_workspace","view_people","view_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications"],
  moderator: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_analytics","view_notifications"],
  viewer: ["view_workspace","view_people","view_segments","view_content","view_distribution","view_analytics","view_notifications"]
};

export function permissionsForRole(role: StudioRole) {
  return ROLE_PERMISSIONS[role];
}

export function hasStudioPermission(role: StudioRole | null | undefined, permission: StudioPermission) {
  return Boolean(role && ROLE_PERMISSIONS[role]?.includes(permission));
}

export function normalizeStudioRole(value: unknown): StudioRole | null {
  return ["owner","admin","editor","moderator","viewer"].includes(String(value)) ? String(value) as StudioRole : null;
}

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
