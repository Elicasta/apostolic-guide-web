import "server-only";
import { allPathways } from "./pathway-catalog";
import { pathwayNarrationHash } from "./pathway-audio";
import { getPeopleMetrics, getPerson, listPeople, personLabel } from "./people-crm";
import {
  buildSolManagerInventory,
  filterSolManagerInventory,
  type SolManagerContentKind,
  type SolManagerPathwayEvidence
} from "./sol-manager-engine";
import { createServiceClient } from "./supabase";

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function getSolManagerContentInventory(input: {
  kind?: SolManagerContentKind;
  pathwaySlug?: string;
} = {}) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");

  const [profiles, audio, scripts, videoProjects, publications, creativeProjects] = await Promise.all([
    service.from("pathway_publishing_profiles")
      .select("pathway_slug,social_automation_id"),
    service.from("pathway_audio_assets")
      .select("pathway_slug,audio_url,content_hash"),
    service.from("pathway_audio_scripts")
      .select("pathway_slug,source_hash,script_hash,status,checker_status,checked_script_hash"),
    service.from("pathway_video_projects")
      .select("pathway_slug,timeline"),
    service.from("pathway_publications")
      .select("pathway_slug,platform,status"),
    service.from("studio_creative_projects")
      .select("pathway_slug,format,status")
      .eq("format", "carousel")
      .neq("status", "archived")
  ]);
  const failure = [profiles, audio, scripts, videoProjects, publications, creativeProjects].find((item) => item.error);
  if (failure?.error) throw new Error(failure.error.message);

  const profileMap = new Map((profiles.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const audioMap = new Map((audio.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const scriptMap = new Map((scripts.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const videoMap = new Map((videoProjects.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const publicationsBySlug = new Map<string, typeof publications.data>();
  for (const row of publications.data ?? []) {
    const slug = String(row.pathway_slug || "");
    if (!slug) continue;
    publicationsBySlug.set(slug, [...(publicationsBySlug.get(slug) ?? []), row]);
  }
  const creativeBySlug = new Map<string, typeof creativeProjects.data>();
  for (const row of creativeProjects.data ?? []) {
    const slug = String(row.pathway_slug || "");
    if (!slug) continue;
    creativeBySlug.set(slug, [...(creativeBySlug.get(slug) ?? []), row]);
  }

  const evidenceBySlug = new Map<string, SolManagerPathwayEvidence>();
  for (const pathway of allPathways) {
    const profile = profileMap.get(pathway.slug);
    const sourceAudio = audioMap.get(pathway.slug);
    const script = scriptMap.get(pathway.slug);
    const video = videoMap.get(pathway.slug);
    const pathwayPublications = publicationsBySlug.get(pathway.slug) ?? [];
    const pathwayCreative = creativeBySlug.get(pathway.slug) ?? [];
    evidenceBySlug.set(pathway.slug, {
      audioUrl: stringOrNull(sourceAudio?.audio_url),
      audioContentHash: stringOrNull(sourceAudio?.content_hash),
      scriptSourceHash: stringOrNull(script?.source_hash),
      scriptHash: stringOrNull(script?.script_hash),
      scriptStatus: stringOrNull(script?.status),
      checkerStatus: stringOrNull(script?.checker_status),
      checkedScriptHash: stringOrNull(script?.checked_script_hash),
      videoProjectReady: Array.isArray(video?.timeline) && video.timeline.length > 0,
      youtubePublished: pathwayPublications.some((row) => String(row.platform).toLowerCase() === "youtube" && row.status === "published"),
      carouselAssets: pathwayCreative.length,
      carouselPublished: pathwayCreative.filter((row) => row.status === "published").length,
      automationLinked: Boolean(profile?.social_automation_id)
    });
  }

  const inventory = buildSolManagerInventory({
    pathways: allPathways.map((pathway) => ({
      slug: pathway.slug,
      title: pathway.title,
      sourceHash: pathwayNarrationHash(pathway)
    })),
    evidenceBySlug
  });
  const kind = input.kind ?? "all";
  const pathwaySlug = input.pathwaySlug?.trim() ?? "";
  return {
    totals: inventory.totals,
    rows: filterSolManagerInventory(inventory, kind, pathwaySlug),
    filter: { kind, pathwaySlug: pathwaySlug || null },
    generatedAt: new Date().toISOString()
  };
}

function summarizeJourney(row: Record<string, unknown>) {
  const journey = row.growth_journeys && typeof row.growth_journeys === "object" && !Array.isArray(row.growth_journeys)
    ? row.growth_journeys as Record<string, unknown>
    : {};
  return {
    enrollmentId: String(row.id || ""),
    journeyId: String(journey.id || ""),
    name: String(journey.name || "Journey"),
    journeyStatus: String(journey.status || ""),
    enrollmentStatus: String(row.status || ""),
    currentStepPosition: Number(row.current_step_position || 0),
    nextActionAt: stringOrNull(row.next_action_at),
    startedAt: stringOrNull(row.started_at),
    completedAt: stringOrNull(row.completed_at),
    updatedAt: stringOrNull(row.updated_at)
  };
}

function summarizePersonDetail(detail: NonNullable<Awaited<ReturnType<typeof getPerson>>>) {
  return {
    id: detail.person.id,
    label: personLabel(detail.person),
    status: detail.person.status,
    source: detail.person.source,
    lastSeenAt: detail.person.last_seen_at,
    tags: detail.tags.map((row) => String(row.tag)),
    journeys: detail.journeys.map((row) => summarizeJourney(row as unknown as Record<string, unknown>)),
    latestEvents: detail.events.slice(0, 5).map((event) => ({
      type: event.event_type,
      channel: event.channel,
      name: event.event_name,
      occurredAt: event.occurred_at
    }))
  };
}

export async function getSolManagerPeopleStatus(input: {
  personId?: string;
  query?: string;
  limit?: number;
} = {}) {
  const personId = input.personId?.trim() ?? "";
  if (personId) {
    const detail = await getPerson(personId);
    if (!detail) return { found: false, person: null };
    return { found: true, person: summarizePersonDetail(detail) };
  }

  const limit = Math.max(1, Math.min(10, Math.round(Number(input.limit) || 10)));
  const [metrics, people] = await Promise.all([
    getPeopleMetrics(),
    listPeople({ query: input.query?.trim() || undefined, limit })
  ]);
  const details = await Promise.all(people.map((person) => getPerson(person.id)));
  return {
    metrics,
    people: details.filter(Boolean).map((detail) => summarizePersonDetail(detail!)),
    query: input.query?.trim() || null,
    generatedAt: new Date().toISOString()
  };
}
