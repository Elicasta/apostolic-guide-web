import { z } from "zod";

const shortText = z.string().trim().min(1).max(1200);

export const growthMechanismSchema = z.enum(["curiosity", "contrast", "conflict", "controversy", "confusion", "clarity"]);

export const thumbnailConceptSchema = z.object({
  copy: z.string().trim().min(1).max(70),
  visual: z.string().trim().min(1).max(600),
  mechanism: growthMechanismSchema
});

const growthPlanCoreSchema = z.object({
  audience: z.object({
    viewerState: shortText,
    tension: shortText,
    promise: shortText,
    payoff: shortText
  }),
  packaging: z.object({
    titleCandidates: z.array(z.string().trim().min(8).max(140)).min(3).max(6),
    selectedTitleIndex: z.number().int().min(0).max(5),
    thumbnailConcepts: z.array(thumbnailConceptSchema).min(2).max(4),
    selectedThumbnailIndex: z.number().int().min(0).max(3),
    clickReason: shortText,
    deliveryExpectation: shortText
  }),
  retention: z.object({
    hook: z.string().trim().min(10).max(1400),
    firstMinuteBeats: z.array(shortText).min(3).max(6),
    openLoops: z.array(shortText).min(1).max(5),
    patternInterrupts: z.array(shortText).min(2).max(8),
    payoff: shortText
  }),
  production: z.object({
    resetBeats: z.array(z.object({ moment: shortText, purpose: shortText, visual: shortText })).max(12),
    bRoll: z.array(z.object({ moment: shortText, idea: shortText })).max(12),
    graphics: z.array(z.object({ moment: shortText, text: z.string().trim().min(1).max(180), purpose: shortText })).max(12)
  }),
  shorts: z.array(z.object({
    hook: z.string().trim().min(8).max(500),
    angle: shortText,
    cta: z.string().trim().min(1).max(300)
  })).min(3).max(5),
  publishing: z.object({
    descriptionAngle: shortText,
    pinnedComment: z.string().trim().min(1).max(1200),
    primaryCta: z.string().trim().min(1).max(500)
  })
});

export const episodeGrowthPlanSchema = growthPlanCoreSchema.extend({
  version: z.literal(1),
  contentRevision: z.string().datetime(),
  sourceFingerprint: z.string().trim().min(4).max(80)
}).superRefine((plan, ctx) => {
  if (plan.packaging.selectedTitleIndex >= plan.packaging.titleCandidates.length) {
    ctx.addIssue({ code: "custom", path: ["packaging", "selectedTitleIndex"], message: "Selected title is outside the candidate list." });
  }
  if (plan.packaging.selectedThumbnailIndex >= plan.packaging.thumbnailConcepts.length) {
    ctx.addIssue({ code: "custom", path: ["packaging", "selectedThumbnailIndex"], message: "Selected thumbnail is outside the concept list." });
  }
});

export type EpisodeGrowthPlan = z.infer<typeof episodeGrowthPlanSchema>;

export function episodeGrowthSourceFingerprint(input: {
  workingTitle: string;
  premise: string;
  primaryPathwaySlug: string;
  supportingPathwaySlugs: string[];
  format: string;
  speakers: Array<{ name: string; role?: string }>;
}) {
  const normalized = JSON.stringify({
    workingTitle: input.workingTitle.trim(),
    premise: input.premise.trim(),
    primaryPathwaySlug: input.primaryPathwaySlug.trim(),
    supportingPathwaySlugs: [...input.supportingPathwaySlugs].map((value) => value.trim()).filter(Boolean).sort(),
    format: input.format.trim(),
    speakers: input.speakers.map((speaker) => ({ name: speaker.name.trim(), role: String(speaker.role || "").trim() }))
  });
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function episodeGrowthPlanMatchesSource(plan: EpisodeGrowthPlan, sourceFingerprint: string) {
  return plan.sourceFingerprint === sourceFingerprint;
}

export const youtubePerformanceSnapshotSchema = z.object({
  capturedAt: z.string().datetime(),
  impressions: z.number().int().min(0),
  views: z.number().int().min(0),
  clickThroughRate: z.number().min(0).max(100),
  averageViewDurationSeconds: z.number().min(0),
  averagePercentageViewed: z.number().min(0).max(100),
  first30SecondRetention: z.number().min(0).max(100).nullable().default(null),
  subscribersGained: z.number().int().min(0).default(0),
  shortsViews: z.number().int().min(0).nullable().default(null),
  shortsAveragePercentageViewed: z.number().min(0).max(100).nullable().default(null)
});
export type YoutubePerformanceSnapshot = z.infer<typeof youtubePerformanceSnapshotSchema>;

export const youtubeChannelBaselineSchema = z.object({
  sampleEpisodes: z.number().int().min(3),
  clickThroughRate: z.number().min(0).max(100),
  averagePercentageViewed: z.number().min(0).max(100),
  first30SecondRetention: z.number().min(0).max(100).nullable().default(null)
});
export type YoutubeChannelBaseline = z.infer<typeof youtubeChannelBaselineSchema>;

export const growthSignalSchema = z.enum(["up", "flat", "down", "unknown"]);
export type GrowthSignal = z.infer<typeof growthSignalSchema>;
export const growthLearningSchema = z.object({
  state: z.enum(["collecting_baseline", "ready"]),
  confidence: z.enum(["low", "medium", "high"]),
  packaging: growthSignalSchema,
  retention: growthSignalSchema,
  overall: growthSignalSchema,
  observations: z.array(z.string().trim().min(1).max(1200)).max(10),
  nextExperiment: z.string().trim().min(1).max(1600)
});
export type GrowthLearning = z.infer<typeof growthLearningSchema>;

export function parseGrowthLearning(value: unknown): GrowthLearning | null {
  const parsed = growthLearningSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function compare(value: number | null, baseline: number | null): GrowthSignal {
  if (value == null || baseline == null || baseline <= 0) return "unknown";
  const ratio = value / baseline;
  if (ratio >= 1.1) return "up";
  if (ratio <= 0.9) return "down";
  return "flat";
}

export function evaluateYoutubeGrowthLearning(snapshotInput: YoutubePerformanceSnapshot, baselineInput?: YoutubeChannelBaseline | null): GrowthLearning {
  const snapshot = youtubePerformanceSnapshotSchema.parse(snapshotInput);
  const baseline = baselineInput ? youtubeChannelBaselineSchema.parse(baselineInput) : null;
  const confidence = snapshot.impressions >= 20_000 && snapshot.views >= 2_000 ? "high" : snapshot.impressions >= 5_000 && snapshot.views >= 500 ? "medium" : "low";

  if (!baseline) {
    return {
      state: "collecting_baseline",
      confidence,
      packaging: "unknown",
      retention: "unknown",
      overall: "unknown",
      observations: ["Performance is stored, but Apostolic Guide needs at least three comparable published episodes before calling a pattern a win or loss."],
      nextExperiment: "Keep the package and retention data attached to the episode so later results can be compared against the channel's own baseline."
    };
  }

  const packaging = compare(snapshot.clickThroughRate, baseline.clickThroughRate);
  const earlyRetention = compare(snapshot.first30SecondRetention, baseline.first30SecondRetention);
  const averageRetention = compare(snapshot.averagePercentageViewed, baseline.averagePercentageViewed);
  const retention = earlyRetention === "down" || averageRetention === "down" ? "down" : earlyRetention === "up" || averageRetention === "up" ? "up" : earlyRetention === "unknown" && averageRetention === "unknown" ? "unknown" : "flat";
  const overall: GrowthSignal = packaging === "up" && retention === "up" ? "up" : packaging === "down" && retention === "down" ? "down" : packaging === "unknown" && retention === "unknown" ? "unknown" : "flat";
  const observations: string[] = [];

  if (packaging === "up") observations.push("The title and thumbnail package is earning more clicks than the channel baseline.");
  if (packaging === "down") observations.push("The title and thumbnail package is earning fewer clicks than the channel baseline.");
  if (retention === "up") observations.push("Viewers are staying longer than the channel baseline after they click.");
  if (retention === "down") observations.push("The episode is losing viewers faster than the channel baseline after the click.");
  if (!observations.length) observations.push("This episode is tracking close to the channel baseline. Treat it as a control, not a new rule.");

  let nextExperiment = "Change one packaging or retention variable on the next comparable episode, then compare again.";
  if (packaging === "down" && retention === "up") nextExperiment = "Keep the content structure. Test a stronger title-thumbnail information gap without changing the episode promise.";
  else if (packaging === "up" && retention === "down") nextExperiment = "Keep the click mechanism. Rewrite the first 30 seconds so the opening immediately fulfills the exact promise made by the title and thumbnail.";
  else if (packaging === "up" && retention === "up") nextExperiment = "Reuse this package-retention pattern on a comparable topic before treating it as a channel rule.";
  else if (packaging === "down" && retention === "down") nextExperiment = "Rework both the package and the opening. The current idea is not earning the click or holding attention after it.";

  return { state: "ready", confidence, packaging, retention, overall, observations, nextExperiment };
}

export function selectedEpisodeTitle(plan: EpisodeGrowthPlan) {
  return plan.packaging.titleCandidates[plan.packaging.selectedTitleIndex] || plan.packaging.titleCandidates[0] || "";
}

export function selectedEpisodeThumbnail(plan: EpisodeGrowthPlan) {
  return plan.packaging.thumbnailConcepts[plan.packaging.selectedThumbnailIndex] || plan.packaging.thumbnailConcepts[0];
}

export function parseEpisodeGrowthPlan(value: unknown): EpisodeGrowthPlan | null {
  const parsed = episodeGrowthPlanSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function selectEpisodeGrowthPackage(planInput: EpisodeGrowthPlan, selection: { titleIndex?: number; thumbnailIndex?: number }) {
  const plan = episodeGrowthPlanSchema.parse(planInput);
  const next = {
    ...plan,
    packaging: {
      ...plan.packaging,
      selectedTitleIndex: selection.titleIndex ?? plan.packaging.selectedTitleIndex,
      selectedThumbnailIndex: selection.thumbnailIndex ?? plan.packaging.selectedThumbnailIndex
    }
  };
  return episodeGrowthPlanSchema.parse(next);
}

export function buildEpisodeGrowthPlanPrompt(input: {
  workingTitle: string;
  premise: string;
  formatLabel: string;
  speakers: string[];
  pathwaySource: string;
}) {
  return `Build the YouTube growth plan for an Apostolic Guide episode BEFORE the script is written.

The plan must make the eventual episode more clickable without becoming bait, and more watchable without turning the teaching into hyperactive content. The speaker should still sound like a teacher. Packaging and pacing do the acquisition work.

EDITOR INPUT
Working title: ${input.workingTitle}
Premise: ${input.premise}
Format: ${input.formatLabel}
Speakers: ${input.speakers.join(", ")}

PACKAGING RULES
- Generate 3 to 6 title candidates and 2 to 4 thumbnail concepts.
- The thumbnail and title must complement each other. Do not repeat the same sentence in both.
- Use curiosity, contrast, conflict, controversy, confusion, or clarity only when the episode can truthfully resolve it.
- Prefer a specific unresolved thought over generic doctrinal labels.
- Never invent a theological problem, misrepresent another view, manufacture outrage, or promise proof that the supplied Pathways cannot deliver.
- Select the strongest title and thumbnail by index.

RETENTION RULES
- Write a concrete hook for roughly the first 0 to 30 seconds.
- Map 3 to 6 first-minute beats. The viewer should know why this matters before exposition expands.
- Define open loops that are actually closed later.
- Define pattern interrupts as idea changes, camera changes, Scripture graphics, B-roll, questions, examples, or visual resets. Do not prescribe random cuts.
- The payoff must answer the exact question created by the package.

PRODUCTION RULES
- Camera A is the authority/default shot. Camera B is punctuation for emphasis, objections, transitions, or hiding edits.
- B-roll and graphics are separate visual layers. Suggest them only where they clarify the thought or reset attention.
- Identify 3 to 5 short-form moments that can stand on their own without distorting the long-form episode.
- Publishing CTA should naturally move viewers deeper into Apostolic Guide or the relevant Pathway.

CANONICAL PATHWAY SOURCE
--- SOURCE START ---
${input.pathwaySource}
--- SOURCE END ---

Return ONLY valid JSON with exactly this shape. Do not include version or timestamps:
{
  "audience": {"viewerState":"...","tension":"...","promise":"...","payoff":"..."},
  "packaging": {
    "titleCandidates":["...","...","..."],
    "selectedTitleIndex":0,
    "thumbnailConcepts":[{"copy":"...","visual":"...","mechanism":"curiosity|contrast|conflict|controversy|confusion|clarity"}],
    "selectedThumbnailIndex":0,
    "clickReason":"...",
    "deliveryExpectation":"..."
  },
  "retention": {"hook":"...","firstMinuteBeats":["..."],"openLoops":["..."],"patternInterrupts":["..."],"payoff":"..."},
  "production": {
    "resetBeats":[{"moment":"...","purpose":"...","visual":"..."}],
    "bRoll":[{"moment":"...","idea":"..."}],
    "graphics":[{"moment":"...","text":"...","purpose":"..."}]
  },
  "shorts":[{"hook":"...","angle":"...","cta":"..."}],
  "publishing":{"descriptionAngle":"...","pinnedComment":"...","primaryCta":"..."}
}`;
}

function extractResponseText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text.trim();
    }
  }
  return "";
}

export function parseGeneratedEpisodeGrowthPlan(text: string, sourceFingerprint: string, contentRevision = new Date().toISOString()) {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let raw: unknown;
  try { raw = JSON.parse(clean); }
  catch { throw new Error("Episode packaging returned invalid JSON. Run the package again."); }
  const core = growthPlanCoreSchema.safeParse(raw);
  if (!core.success) throw new Error("Episode packaging returned an invalid growth plan. Run the package again.");
  return episodeGrowthPlanSchema.parse({ version: 1, contentRevision, sourceFingerprint, ...core.data });
}

export async function generateEpisodeGrowthPlan(input: { apiKey: string; model: string; prompt: string; sourceFingerprint: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, reasoning: { effort: "medium" }, text: { verbosity: "medium" }, input: input.prompt, max_output_tokens: 6500 })
  });
  if (!response.ok) throw new Error(`Episode packaging failed (${response.status}). ${(await response.text().catch(() => "")).slice(0, 900)}`);
  const text = extractResponseText(await response.json());
  if (!text) throw new Error("Episode packaging returned no plan.");
  return parseGeneratedEpisodeGrowthPlan(text, input.sourceFingerprint);
}
