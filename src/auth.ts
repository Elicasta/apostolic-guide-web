import { createSupabaseServerClient, isSupabaseConfigured } from "./supabase";

export async function getAdminAccess() {
  if (!isSupabaseConfigured()) return { state: "unconfigured" as const, user: null };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { state: "unconfigured" as const, user: null };

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { state: "signed_out" as const, user: null };

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const metadataRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : "";

  let databaseRole = false;
  try {
    const { data: roles } = await supabase.schema("platform").from("user_roles").select("role").eq("user_id", user.id);
    databaseRole = Boolean(roles?.some((row: { role: string }) => ["editor", "publisher", "admin"].includes(row.role)));
  } catch {}

  const allowed = ["editor", "publisher", "admin"].includes(metadataRole)
    || databaseRole
    || Boolean(user.email && allowedEmails.includes(user.email.toLowerCase()));

  return allowed
    ? { state: "allowed" as const, user: { id: user.id, email: user.email } }
    : { state: "forbidden" as const, user: { id: user.id, email: user.email } };
}
