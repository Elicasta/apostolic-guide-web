import "server-only";
import { randomUUID } from "node:crypto";
import { buildCreativeSearchText, collectScriptureReferences, type CreativeFrame } from "./creative-project";
import { buildForgeQueue, summarizeForgeQueue, type ForgePathwayState } from "./forge-engine";
import { pathwayNarrationHash } from "./pathway-audio";
import { allPathways, pathwayBySlug } from "./pathway-catalog";
import { createServiceClient } from "./supabase";

const FORGE_MODEL = () => process.env.OPENAI_CAROUSEL_MODEL?.trim() || process.env.OPENAI_SOL_OPERATOR_MODEL?.trim() || "gpt-5.6-sol";

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

type ForgeGeneratedFrame = {
  role: "hook" | "scripture" | "explanation" | "support" | "statement" | "cta";
  headline: string;
  body: string;
  scripture: string;
  overlayText: string;
  supportingNotes: string;
  cta: string;
  caption: string;
  altText: string;
};

type ForgeCarouselDraft = {
  title: string;
  unifiedCaption: string;
  cta: string;
  rationale: string;
  frames: ForgeGeneratedFrame[];
};

type ForgeDoctrineReview = {
  status: "pass" | "warning" | "blocked";
  summary: string;
  issues: Array<{ severity: "warning" | "blocked"; frame: number; issue: string }>;
};

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function extractResponseText(value: unknown) {
  const response = record(value);
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    const row = record(item);
    if (row.type !== "message" || !Array.isArray(row.content)) continue;
    for (const part of row.content) {
      const content = record(part);
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function campaignRank(status: unknown) {
  if (status === "active") return 0;
  if (status === "planning") return 1;
  if (status === "paused") return 3;
  if (status === "complete" || status === "archived") return 9;
  return 2;
}

function frameCount(stepCount: number) {
  return Math.max(6, Math.min(9, stepCount + 2));
}

function generationSchema(target: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "unifiedCaption", "cta", "rationale", "frames"],
    properties: {
      title: { type: "string", maxLength: 180 },
      unifiedCaption: { type: "string", maxLength: 2200 },
      cta: { type: "string", maxLength: 500 },
      rationale: { type: "string", maxLength: 800 },
      frames: {
        type: "array",
        minItems: target,
        maxItems: target,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "headline", "body", "scripture", "overlayText", "supportingNotes", "cta", "caption", "altText"],
          properties: {
            role: { type: "string", enum: ["hook", "scripture", "explanation", "support", "statement", "cta"] },
            headline: { type: "string", maxLength: 240 },
            body: { type: "string", maxLength: 1400 },
            scripture: { type: "string", maxLength: 180 },
            overlayText: { type: "string", maxLength: 500 },
            supportingNotes: { type: "string", maxLength: 1600 },
            cta: { type: "string", maxLength: 500 },
            caption: { type: "string", maxLength: 2200 },
            altText: { type: "string", maxLength: 1000 }
          }
        }
      }
    }
  } as const;
}

const doctrineSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "issues"],
  properties: {
    status: { type: "string", enum: ["pass", "warning", "blocked"] },
    summary: { type: "string", maxLength: 800 },
    issues: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "frame", "issue"],
        properties: {
          severity: { type: "string", enum: ["warning", "blocked"] },
          frame: { type: "integer", minimum: 0, maximum: 20 },
          issue: { type: "string", maxLength: 500 }
        }
      }
    }
  }
} as const;

async function callStructuredModel(input: { apiKey: string; name: string; schema: object; developer: string; user: string }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 70_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: FORGE_MODEL(),
        reasoning: { effort: "medium" },
        text: { verbosity: "low", format: { type: "json_schema", name: input.name, strict: true, schema: input.schema } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: input.developer }] },
          { role: "user", content: [{ type: "input_text", text: input.user }] }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Forge model request failed (${response.status}).`);
    const text = extractResponseText(payload);
    if (!text) throw new Error("Forge received no structured model output.");
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("Forge model request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getForgeProductionStatus() {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");

  const [profiles, audio, scripts, videos, publications, creatives, runs] = await Promise.all([
    service.from("pathway_publishing_profiles").select("pathway_slug,campaign_status"),
    service.from("pathway_audio_assets").select("pathway_slug,audio_url,content_hash"),
    service.from("pathway_audio_scripts").select("pathway_slug,source_hash,script_hash,status,checker_status,checked_script_hash"),
    service.from("pathway_video_projects").select("pathway_slug,timeline"),
    service.from("pathway_publications").select("pathway_slug,platform,status"),
    service.from("studio_creative_projects").select("id,pathway_slug,format,status").eq("format", "carousel").neq("status", "archived"),
    service.from("sol_operator_runs").select("recipe_key,pathway_slug,status,updated_at").in("status", ["queued", "running", "retrying", "waiting_review", "failed", "stalled"])
  ]);
  const failure = [profiles, audio, scripts, videos, publications, creatives, runs].find((item) => item.error);
  if (failure?.error) throw new Error(failure.error.message);

  const profileMap = new Map((profiles.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const audioMap = new Map((audio.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const scriptMap = new Map((scripts.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const videoMap = new Map((videos.data ?? []).map((row) => [String(row.pathway_slug), row]));
  const publicationsBySlug = new Map<string, typeof publications.data>();
  for (const row of publications.data ?? []) {
    const slug = String(row.pathway_slug || "");
    if (slug) publicationsBySlug.set(slug, [...(publicationsBySlug.get(slug) ?? []), row]);
  }
  const creativeBySlug = new Map<string, typeof creatives.data>();
  for (const row of creatives.data ?? []) {
    const slug = String(row.pathway_slug || "");
    if (slug) creativeBySlug.set(slug, [...(creativeBySlug.get(slug) ?? []), row]);
  }
  const activeBySlug = new Map<string, string[]>();
  for (const row of runs.data ?? []) {
    const slug = String(row.pathway_slug || "");
    if (!slug || !["queued", "running", "retrying", "waiting_review"].includes(String(row.status))) continue;
    activeBySlug.set(slug, [...(activeBySlug.get(slug) ?? []), String(row.recipe_key)]);
  }

  const pathwayStates: ForgePathwayState[] = allPathways.map((pathway) => {
    const sourceHash = pathwayNarrationHash(pathway);
    const sourceAudio = audioMap.get(pathway.slug);
    const script = scriptMap.get(pathway.slug);
    const currentScript = Boolean(script?.script_hash && script?.source_hash === sourceHash);
    const scriptApproved = currentScript && script?.status === "approved";
    const doctrinePassed = Boolean(scriptApproved && script?.checker_status === "passed" && script?.checked_script_hash === script?.script_hash);
    const audioMatches = Boolean(sourceAudio?.audio_url && script?.script_hash && sourceAudio?.content_hash === script.script_hash);
    const audioReady = Boolean(doctrinePassed && audioMatches);
    const hasAudio = Boolean(sourceAudio?.audio_url);
    const pathwayCreatives = creativeBySlug.get(pathway.slug) ?? [];
    const pathwayPublications = publicationsBySlug.get(pathway.slug) ?? [];
    return {
      slug: pathway.slug,
      title: pathway.title,
      campaignRank: campaignRank(profileMap.get(pathway.slug)?.campaign_status),
      audioReady,
      audioStale: hasAudio && !audioReady,
      audioBlocked: !hasAudio && (!currentScript || !scriptApproved || !doctrinePassed),
      carouselProjects: pathwayCreatives.length,
      carouselPublished: pathwayCreatives.filter((row) => row.status === "published").length,
      youtubePublished: pathwayPublications.some((row) => String(row.platform).toLowerCase() === "youtube" && row.status === "published"),
      videoProjectReady: Array.isArray(videoMap.get(pathway.slug)?.timeline) && (videoMap.get(pathway.slug)?.timeline as unknown[]).length > 0,
      activeRecipes: activeBySlug.get(pathway.slug) ?? []
    };
  });

  const queue = buildForgeQueue(pathwayStates);
  const visibleRuns = (runs.data ?? []).filter((row) => ["queued", "running", "retrying", "waiting_review", "failed", "stalled"].includes(String(row.status)));
  return {
    generatedAt: new Date().toISOString(),
    queue,
    summary: summarizeForgeQueue(queue),
    pathways: pathwayStates,
    execution: {
      moving: visibleRuns.filter((row) => ["queued", "running", "retrying"].includes(String(row.status))).length,
      review: visibleRuns.filter((row) => row.status === "waiting_review").length,
      failed: visibleRuns.filter((row) => row.status === "failed" || row.status === "stalled").length
    }
  };
}

export async function stageForgeCarousel(input: { pathwaySlug: string; actorUserId?: string | null }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Forge.");
  const pathway = pathwayBySlug(input.pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");

  const existing = await service.from("studio_creative_projects")
    .select("id,title,status,updated_at")
    .eq("pathway_slug", pathway.slug)
    .eq("format", "carousel")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) {
    return {
      reused: true,
      projectId: String(existing.data.id),
      title: String(existing.data.title),
      status: String(existing.data.status),
      doctrine: null,
      href: `/admin/creative-studio/${existing.data.id}`
    };
  }

  const target = frameCount(pathway.steps.length);
  const pathwaySource = [
    `PATHWAY: ${pathway.title}`,
    `COLLECTION: ${pathway.collection}`,
    `SUMMARY: ${pathway.summary}`,
    ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)
  ].join("\n");

  const draft = await callStructuredModel({
    apiKey,
    name: "forge_carousel_draft",
    schema: generationSchema(target),
    developer: [
      "You are Forge, the Apostolic Guide production agent.",
      "Build a finished editorial carousel draft from the supplied canonical Pathway.",
      "Do real production work. Return publishable copy, not a plan or suggestions.",
      "Keep Apostolic Guide's Oneness theology and the Pathway's canonical argument intact.",
      "Do not invent Bible quotations. Use references in the scripture field and paraphrase teaching points only when needed.",
      "Do not march mechanically through every Pathway step. Build one clear thesis with a strong hook and a clean swipe sequence.",
      "Each slide should do one job. Headlines must be short enough for mobile. Body copy should normally be 1–3 short sentences.",
      "The final slide should point to the matching Apostolic Guide Pathway when a CTA is appropriate.",
      `Return exactly ${target} frames.`
    ].join("\n"),
    user: pathwaySource
  }) as ForgeCarouselDraft;

  if (!draft || !Array.isArray(draft.frames) || draft.frames.length !== target) throw new Error("Forge returned an invalid carousel draft.");

  const doctrine = await callStructuredModel({
    apiKey,
    name: "forge_carousel_doctrine_review",
    schema: doctrineSchema,
    developer: [
      "You are Sentinel reviewing a Forge carousel against the canonical Apostolic Guide Pathway supplied by the user.",
      "Check only theological/source alignment, Scripture-reference applicability, and whether the draft overstates what the canonical Pathway teaches.",
      "Do not block for style preferences. Do block claims that contradict the canonical Pathway or misuse a Scripture reference.",
      "A warning means the draft is usable but needs human attention. Blocked means it must not advance toward publishing."
    ].join("\n"),
    user: `${pathwaySource}\n\nFORGE DRAFT:\n${JSON.stringify(draft)}`
  }) as ForgeDoctrineReview;

  const frames: CreativeFrame[] = draft.frames.map((frame, index) => ({
    id: randomUUID(),
    order: index + 1,
    role: frame.role,
    headline: String(frame.headline || "").slice(0, 240),
    body: String(frame.body || "").slice(0, 1400),
    scripture: String(frame.scripture || "").slice(0, 180),
    overlayText: String(frame.overlayText || "").slice(0, 500),
    supportingNotes: String(frame.supportingNotes || "").slice(0, 1600),
    cta: String(frame.cta || "").slice(0, 500),
    pathwayLink: `/pathways/${pathway.slug}`,
    caption: String(frame.caption || "").slice(0, 2200),
    altText: String(frame.altText || "").slice(0, 1000)
  }));
  const title = String(draft.title || `${pathway.title} · Forge Carousel`).trim().slice(0, 180);
  const unifiedCaption = String(draft.unifiedCaption || "").slice(0, 10000);
  const cta = String(draft.cta || "").slice(0, 2000);
  const tags = ["forge", "sol-managed", `doctrine-${doctrine.status}`];
  const editorState = {
    frames,
    visualSettings: { style: "street-theology", template: "street-theology", texture: "ag-navy-paper", alignment: "center" },
    sourceImages: [],
    generatedText: {
      producer: "Forge",
      rationale: draft.rationale,
      sourceHash: pathwayNarrationHash(pathway),
      doctrineReview: doctrine,
      generatedAt: new Date().toISOString()
    }
  };
  const scriptureReferences = collectScriptureReferences(frames);
  const now = new Date().toISOString();
  const insert: Record<string, unknown> = {
    title,
    pathway_slug: pathway.slug,
    pathway_collection: pathway.collection,
    intent: "teaching",
    format: "carousel",
    destination: "instagram",
    frame_count: frames.length,
    status: "draft",
    editor_state: editorState,
    unified_caption: unifiedCaption,
    cta,
    scripture_references: scriptureReferences,
    tags,
    search_text: buildCreativeSearchText({ title, pathwayTitle: pathway.title, pathwaySlug: pathway.slug, intent: "teaching", format: "carousel", frames, unifiedCaption, tags }),
    state_version: 1,
    last_autosaved_at: now,
    created_at: now,
    updated_at: now
  };
  if (input.actorUserId) {
    insert.created_by = input.actorUserId;
    insert.updated_by = input.actorUserId;
  }
  const created = await service.from("studio_creative_projects").insert(insert).select("id,title,status").single();
  if (created.error) throw new Error(created.error.message);

  return {
    reused: false,
    projectId: String(created.data.id),
    title: String(created.data.title),
    status: String(created.data.status),
    doctrine,
    href: `/admin/creative-studio/${created.data.id}`
  };
}
