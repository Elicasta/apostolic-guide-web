import { createServiceClient } from "./supabase";
import { getSocialPublishingCredentialStatus } from "./social-publishing-integrations";

export type PublishingHealthCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type PublishingHealth = {
  ok: boolean;
  checks: PublishingHealthCheck[];
};

async function tableCheck(label: string, schema: string, table: string): Promise<PublishingHealthCheck> {
  const service = createServiceClient();
  if (!service) return { key: `${schema}.${table}`, label, ok: false, detail: "Supabase service access is not configured." };
  const client = schema === "public" ? service : service.schema(schema);
  const result = await client.from(table).select("*", { head: true, count: "exact" }).limit(1);
  return {
    key: `${schema}.${table}`,
    label,
    ok: !result.error,
    detail: result.error ? result.error.message : "Ready"
  };
}

export async function getPublishingHealth(): Promise<PublishingHealth> {
  const service = createServiceClient();
  const checks = await Promise.all([
    tableCheck("Creative Projects", "public", "studio_creative_projects"),
    tableCheck("Creative revisions", "public", "studio_creative_project_revisions"),
    tableCheck("Pathway Assets", "public", "studio_pathway_assets"),
    tableCheck("Publication ledger", "public", "pathway_publications"),
    tableCheck("Publishing calendar", "public", "studio_content_calendar_items"),
    tableCheck("Website Content", "content", "items"),
    tableCheck("App Content", "app_content", "records")
  ]);

  try {
    const social = await getSocialPublishingCredentialStatus();
    const instagram = social.find((item) => item.platform === "instagram");
    checks.push({
      key: "instagram",
      label: "Instagram publishing",
      ok: Boolean(instagram?.accountAuthorized),
      detail: instagram?.accountAuthorized ? `Connected${instagram.accountLabel ? ` as ${instagram.accountLabel}` : ""}` : "Instagram publishing credentials are not authorized."
    });
  } catch (error) {
    checks.push({
      key: "instagram",
      label: "Instagram publishing",
      ok: false,
      detail: error instanceof Error ? error.message : "Instagram publishing status could not be checked."
    });
  }

  if (service) {
    const syncState = await service.from("social_connection_status")
      .select("last_error,last_verified_at,updated_at")
      .eq("platform", "instagram")
      .maybeSingle();
    const lastError = typeof syncState.data?.last_error === "string" ? syncState.data.last_error.trim() : "";
    checks.push({
      key: "instagram-feed-sync",
      label: "Instagram calendar sync",
      ok: !syncState.error && !lastError,
      detail: syncState.error ? syncState.error.message : lastError || "No sync error is recorded."
    });
  } else {
    checks.push({ key: "instagram-feed-sync", label: "Instagram calendar sync", ok: false, detail: "Supabase service access is not configured." });
  }

  checks.push({
    key: "vercel-blob",
    label: "Rendered media storage",
    ok: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    detail: process.env.BLOB_READ_WRITE_TOKEN?.trim() ? "Vercel Blob is configured." : "BLOB_READ_WRITE_TOKEN is missing."
  });
  checks.push({
    key: "sol-generation",
    label: "Sol creative generation",
    ok: Boolean(process.env.OPENAI_API_KEY?.trim()),
    detail: process.env.OPENAI_API_KEY?.trim() ? "AI generation is configured." : "OPENAI_API_KEY is missing. Projects still persist, but Sol generation is disabled."
  });
  checks.push({
    key: "scheduler",
    label: "Publishing scheduler",
    ok: Boolean(process.env.CRON_SECRET?.trim()),
    detail: process.env.CRON_SECRET?.trim() ? "Scheduled publishing can authenticate cron workers." : "CRON_SECRET is missing."
  });

  return { ok: checks.every((check) => check.ok), checks };
}
