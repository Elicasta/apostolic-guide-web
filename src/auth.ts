import { createServiceClient, createSupabaseServerClient, isSupabaseConfigured } from "./supabase";
import { hasStudioPermission, normalizeStudioRole, permissionsForRole, type StudioPermission, type StudioRole } from "./studio-roles";

export async function getAdminAccess() {
  if (!isSupabaseConfigured()) return { state: "unconfigured" as const, user: null, role: null as StudioRole | null, permissions: [] as StudioPermission[] };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: "unconfigured" as const, user: null, role: null as StudioRole | null, permissions: [] as StudioPermission[] };

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { state: "signed_out" as const, user: null, role: null as StudioRole | null, permissions: [] as StudioPermission[] };

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const service = createServiceClient();
  let role: StudioRole | null = null;

  if (service) {
    try {
      const { data: member } = await service.from("studio_members").select("role").eq("user_id", user.id).maybeSingle();
      role = normalizeStudioRole(member?.role);
    } catch {}
  }

  if (!role) {
    const metadataRole = normalizeStudioRole(user.app_metadata?.role);
    if (metadataRole) role = metadataRole;
    else if (user.email && allowedEmails.includes(user.email.toLowerCase())) role = "owner";
  }

  if (!role) return { state: "forbidden" as const, user: { id: user.id, email: user.email }, role: null as StudioRole | null, permissions: [] as StudioPermission[] };
  return { state: "allowed" as const, user: { id: user.id, email: user.email }, role, permissions: permissionsForRole(role) };
}

export async function getStudioPermission(permission: StudioPermission) {
  const access = await getAdminAccess();
  return { access, allowed: access.state === "allowed" && hasStudioPermission(access.role, permission) };
}
