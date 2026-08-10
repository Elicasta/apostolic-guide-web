import { createServiceClient, isSupabaseConfigured, isSupabaseServiceConfigured } from "./supabase";
import { getInstagramConnection } from "./social-messaging";

export type HealthState = "healthy" | "warning" | "error" | "not_configured";
export type HealthCheck = {
  key: string;
  label: string;
  state: HealthState;
  summary: string;
  detail?: string;
  metric?: string;
  href?: string;
};

function stateRank(state: HealthState) {
  return state === "error" ? 3 : state === "warning" ? 2 : state === "not_configured" ? 1 : 0;
}

async function countQuery(run: () => Promise<{ count: number | null; error: { message?: string } | null }>) {
  try {
    const result = await run();
    return result.error ? { ok: false, count: 0, error: result.error.message ?? "Query failed." } : { ok: true, count: result.count ?? 0, error: null };
  } catch (error) {
    return { ok: false, count: 0, error: error instanceof Error ? error.message : "Query failed." };
  }
}

export async function getStudioHealth() {
  const checks: HealthCheck[] = [
    { key: "runtime", label: "Website", state: "healthy", summary: "The current Studio deployment is executing normally.", detail: "This check passes only when the server can render the health workspace." },
    { key: "app", label: "App experience", state: "healthy", summary: "App install and handoff routes are included in the current deployment.", href: "/admin/app-content" },
    { key: "search", label: "Search & Scripture", state: "healthy", summary: "The bundled Scripture and pathway search experience is available in this build.", href: "/search" }
  ];

  const service = createServiceClient();
  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured() || !service) {
    checks.push({ key: "supabase", label: "Supabase", state: "error", summary: "Database service access is not configured.", href: "/admin/setup" });
  } else {
    const people = await countQuery(() => service.from("people").select("id", { count: "exact", head: true }));
    checks.push({ key: "supabase", label: "Supabase", state: people.ok ? "healthy" : "error", summary: people.ok ? "Service-role database access is responding." : "Database query failed.", detail: people.error ?? undefined, metric: people.ok ? `${people.count} people` : undefined, href: "/admin/people" });

    const analyticsSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const analytics = await countQuery(() => service.schema("analytics").from("events").select("id", { count: "exact", head: true }).gte("occurred_at", analyticsSince));
    checks.push({ key: "analytics", label: "Analytics", state: analytics.ok ? "healthy" : "error", summary: analytics.ok ? "Analytics storage is responding." : "Analytics storage is unavailable.", detail: analytics.error ?? undefined, metric: analytics.ok ? `${analytics.count} events / 24h` : undefined, href: "/admin/analytics" });

    const inbox = await countQuery(() => service.from("inbox_conversations").select("id", { count: "exact", head: true }));
    checks.push({ key: "inbox", label: "Inbox", state: inbox.ok ? "healthy" : "error", summary: inbox.ok ? "Conversation storage is responding." : "Inbox storage is unavailable.", detail: inbox.error ?? undefined, metric: inbox.ok ? `${inbox.count} conversations` : undefined, href: "/admin/inbox" });

    try {
      const { count, error } = await service.from("growth_journey_enrollments").select("id", { count: "exact", head: true }).not("last_error", "is", null);
      const failed = count ?? 0;
      checks.push({ key: "journeys", label: "Journeys", state: error ? "error" : failed > 0 ? "warning" : "healthy", summary: error ? "Journey state could not be checked." : failed > 0 ? "Some journey enrollments need attention." : "Journey engine state is clear.", detail: error?.message, metric: !error ? `${failed} with errors` : undefined, href: "/admin/journeys" });
    } catch (error) {
      checks.push({ key: "journeys", label: "Journeys", state: "error", summary: "Journey state could not be checked.", detail: error instanceof Error ? error.message : undefined, href: "/admin/journeys" });
    }

    const notifications = await countQuery(() => service.from("studio_notifications").select("id", { count: "exact", head: true }).is("read_at", null));
    checks.push({ key: "notifications", label: "Notifications", state: notifications.ok ? "healthy" : "error", summary: notifications.ok ? "Studio notification storage is responding." : "Notification storage is unavailable.", detail: notifications.error ?? undefined, metric: notifications.ok ? `${notifications.count} unread` : undefined, href: "/admin/notifications" });

    try {
      const { count, error } = await service.schema("analytics").from("email_campaigns").select("id", { count: "exact", head: true }).eq("status", "failed");
      const failed = count ?? 0;
      checks.push({ key: "broadcasts", label: "Broadcasts", state: error ? "error" : failed > 0 ? "warning" : "healthy", summary: error ? "Broadcast history could not be checked." : failed > 0 ? "Some broadcasts have failed." : "No failed broadcasts are recorded.", detail: error?.message, metric: !error ? `${failed} failed` : undefined, href: "/admin/broadcasts" });
    } catch (error) {
      checks.push({ key: "broadcasts", label: "Broadcasts", state: "error", summary: "Broadcast history could not be checked.", detail: error instanceof Error ? error.message : undefined, href: "/admin/broadcasts" });
    }
  }

  try {
    const instagram = await getInstagramConnection();
    const state: HealthState = !instagram.configured ? "not_configured" : instagram.lastError ? "error" : !instagram.webhookSubscribed ? "warning" : "healthy";
    checks.push({
      key: "instagram",
      label: "Instagram / Meta",
      state,
      summary: !instagram.configured ? "Instagram credentials are incomplete." : instagram.lastError ? "Instagram reported an integration error." : instagram.webhookSubscribed ? "Instagram webhook integration is connected." : "Instagram is configured but webhook subscription needs attention.",
      detail: instagram.lastError ?? (instagram.lastWebhookAt ? `Last webhook ${new Date(instagram.lastWebhookAt).toLocaleString()}` : "No webhook received yet."),
      metric: instagram.username ? `@${instagram.username}` : undefined,
      href: "/admin/social"
    });
  } catch (error) {
    checks.push({ key: "instagram", label: "Instagram / Meta", state: "error", summary: "Instagram connection status could not be read.", detail: error instanceof Error ? error.message : undefined, href: "/admin/social" });
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  checks.push({ key: "email", label: "Email / Resend", state: resendConfigured ? "healthy" : "not_configured", summary: resendConfigured ? "Email delivery credentials are configured." : "Email delivery credentials are incomplete.", href: "/admin/broadcasts" });

  const worst = checks.reduce((current, item) => stateRank(item.state) > stateRank(current) ? item.state : current, "healthy" as HealthState);
  return {
    overall: worst,
    checks,
    healthy: checks.filter((item) => item.state === "healthy").length,
    warnings: checks.filter((item) => item.state === "warning" || item.state === "not_configured").length,
    errors: checks.filter((item) => item.state === "error").length,
    checkedAt: new Date().toISOString()
  };
}
