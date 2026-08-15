export type SolMode = "watch" | "assist" | "trusted";
export type SolRecipeKey = "audio_to_youtube" | "carousel_topic_pack" | "journey_automation_draft";
export type SolProposalPriority = "urgent" | "high" | "medium" | "low";
export type SolProposalRisk = "safe_draft" | "review_required" | "external_effect";
export type SolProposalStatus = "pending" | "approved" | "running" | "completed" | "dismissed" | "failed" | "expired";
export type SolRunStatus = "queued" | "running" | "waiting_review" | "completed" | "failed" | "cancelled";

export type SolEvidence = { label: string; value: string | number; state?: "ready" | "missing" | "blocked" | "info" };
export type SolPlanStep = { key: string; label: string; gate?: "automatic" | "theology" | "review" | "external" };
export type SolTopic = { title: string; prompt: string; reference: string };

export type SolPathwayObservation = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  steps: Array<{ title: string; reference: string; explanation: string }>;
  campaignStatus: string | null;
  primaryKeyword: string | null;
  destinationUrl: string;
  automationLinked: boolean;
  audioReady: boolean;
  scriptApproved: boolean;
  theologyPassed: boolean;
  audioMatchesScript: boolean;
  videoProjectReady: boolean;
  youtubeRenderState: string | null;
  youtubePublished: boolean;
  carouselAssets: number;
  carouselPublished: number;
  activeRecipes: SolRecipeKey[];
};

export type SolKpiTarget = { key: "youtube" | "carousel" | "short_video" | "post"; label: string; target: number; actual: number };

export type SolProposalDraft = {
  proposalKey: string;
  recipeKey: SolRecipeKey;
  title: string;
  summary: string;
  priority: SolProposalPriority;
  risk: SolProposalRisk;
  pathwaySlugs: string[];
  evidence: SolEvidence[];
  plan: SolPlanStep[];
  suggestedConstraints: string[];
  inputs: Record<string, unknown>;
};

export type SolOperatorAnalysis = {
  proposals: SolProposalDraft[];
  kpis: SolKpiTarget[];
  coverage: {
    pathways: number;
    audioReady: number;
    youtubePublished: number;
    carouselPublished: number;
    automationsLinked: number;
  };
};

export const SOL_RECIPE_LABELS: Record<SolRecipeKey, string> = {
  audio_to_youtube: "Pathway audio to YouTube",
  carousel_topic_pack: "Pathway carousel topic pack",
  journey_automation_draft: "Journey and automation draft"
};

export const SOL_RECIPE_STEPS: Record<SolRecipeKey, SolPlanStep[]> = {
  audio_to_youtube: [
    { key: "validate_source", label: "Verify approved script, theology check, and matching audio", gate: "theology" },
    { key: "analyze_video", label: "Build the timed Pathway video project", gate: "automatic" },
    { key: "publishing_kit", label: "Create the YouTube title, description, chapters, and thumbnail brief", gate: "automatic" },
    { key: "queue_render", label: "Queue the YouTube render", gate: "automatic" },
    { key: "review", label: "Stop for finished-video and publishing approval", gate: "review" }
  ],
  carousel_topic_pack: [
    { key: "build_topics", label: "Build five topics from the canonical Pathway steps", gate: "automatic" },
    { key: "generate_decks", label: "Generate each mobile carousel plan", gate: "automatic" },
    { key: "theology_check", label: "Check every slide against the Pathway and doctrine policy", gate: "theology" },
    { key: "save_drafts", label: "Save reviewable carousel assets", gate: "automatic" },
    { key: "review", label: "Stop before export or publishing", gate: "review" }
  ],
  journey_automation_draft: [
    { key: "verify_keyword", label: "Verify the Pathway keyword and destination", gate: "automatic" },
    { key: "create_automation", label: "Create a disabled Instagram keyword automation", gate: "automatic" },
    { key: "create_journey", label: "Create a draft relationship journey", gate: "automatic" },
    { key: "link_project", label: "Link the draft automation to the Pathway project", gate: "automatic" },
    { key: "review", label: "Stop before activation", gate: "review" }
  ]
};

function topicPack(pathway: SolPathwayObservation): SolTopic[] {
  return pathway.steps.slice(0, 5).map((step) => ({
    title: step.title,
    reference: step.reference,
    prompt: `Create a concise Scripture-first carousel showing how ${step.reference} supports “${step.title}” inside the ${pathway.title} Pathway. Stay inside the canonical Pathway wording and lead naturally into the full study.`
  }));
}

function campaignRank(status: string | null) {
  if (status === "active") return 0;
  if (status === "planning") return 1;
  if (status === "paused") return 3;
  if (status === "complete" || status === "archived") return 9;
  return 2;
}

export function buildSolOperatorAnalysis(input: {
  pathways: SolPathwayObservation[];
  weeklyTargets: Record<string, number>;
  weeklyActuals: Record<string, number>;
}): SolOperatorAnalysis {
  const proposals: SolProposalDraft[] = [];
  const audioCandidates = input.pathways.filter((pathway) =>
    pathway.audioReady
    && pathway.scriptApproved
    && pathway.theologyPassed
    && pathway.audioMatchesScript
    && !pathway.youtubePublished
    && !pathway.activeRecipes.includes("audio_to_youtube")
  ).slice(0, 5);

  if (audioCandidates.length) {
    proposals.push({
      proposalKey: `audio-to-youtube:${audioCandidates.map((item) => item.slug).join(",")}`,
      recipeKey: "audio_to_youtube",
      title: `Finish ${audioCandidates.length} ${audioCandidates.length === 1 ? "Pathway video" : "Pathway videos"}`,
      summary: `${audioCandidates.length === 1 ? "This approved Pathway audio is" : "These approved Pathway audios are"} ready for timed video production, YouTube copy, and renderer handoff. Sol will stop before publishing.`,
      priority: audioCandidates.some((item) => item.videoProjectReady || item.youtubeRenderState) ? "high" : "medium",
      risk: "review_required",
      pathwaySlugs: audioCandidates.map((item) => item.slug),
      evidence: [
        { label: "Approved audio", value: audioCandidates.length, state: "ready" },
        { label: "Theology checks passed", value: audioCandidates.filter((item) => item.theologyPassed).length, state: "ready" },
        { label: "Published on YouTube", value: 0, state: "missing" }
      ],
      plan: SOL_RECIPE_STEPS.audio_to_youtube,
      suggestedConstraints: ["Run the theology gate before production", "Do not publish", "Keep every Pathway in its canonical order"],
      inputs: { pathways: audioCandidates.map((item) => ({ slug: item.slug, title: item.title })) }
    });
  }

  const carouselCandidate = input.pathways
    .filter((pathway) => pathway.carouselAssets === 0 && !pathway.activeRecipes.includes("carousel_topic_pack") && campaignRank(pathway.campaignStatus) < 9)
    .sort((a, b) => campaignRank(a.campaignStatus) - campaignRank(b.campaignStatus) || Number(b.audioReady) - Number(a.audioReady))[0];
  if (carouselCandidate) {
    const topics = topicPack(carouselCandidate);
    proposals.push({
      proposalKey: `carousel-topic-pack:${carouselCandidate.slug}`,
      recipeKey: "carousel_topic_pack",
      title: `Create ${topics.length} ${carouselCandidate.title} carousel topics`,
      summary: `Sol found no carousel assets for ${carouselCandidate.title}. The five canonical Pathway steps can become a connected series without inventing a second content outline.`,
      priority: carouselCandidate.campaignStatus === "active" ? "high" : "medium",
      risk: "review_required",
      pathwaySlugs: [carouselCandidate.slug],
      evidence: [
        { label: "Canonical steps", value: carouselCandidate.steps.length, state: "ready" },
        { label: "Existing carousel assets", value: carouselCandidate.carouselAssets, state: "missing" },
        { label: "Campaign", value: carouselCandidate.campaignStatus ?? "not started", state: "info" }
      ],
      plan: SOL_RECIPE_STEPS.carousel_topic_pack,
      suggestedConstraints: ["Run doctrine checks on every deck", "Save drafts only", "Do not repeat the same hook structure"],
      inputs: { slug: carouselCandidate.slug, title: carouselCandidate.title, topics }
    });
  }

  const automationCandidates = input.pathways.filter((pathway) =>
    Boolean(pathway.primaryKeyword)
    && !pathway.automationLinked
    && !pathway.activeRecipes.includes("journey_automation_draft")
    && campaignRank(pathway.campaignStatus) < 9
  ).slice(0, 5);
  if (automationCandidates.length) {
    proposals.push({
      proposalKey: `journey-automation:${automationCandidates.map((item) => item.slug).join(",")}`,
      recipeKey: "journey_automation_draft",
      title: `Draft ${automationCandidates.length} missing ${automationCandidates.length === 1 ? "Pathway automation" : "Pathway automations"}`,
      summary: "These Pathway projects already have keywords but no linked Meta automation. Sol can create disabled automations and draft journeys for review.",
      priority: "high",
      risk: "safe_draft",
      pathwaySlugs: automationCandidates.map((item) => item.slug),
      evidence: [
        { label: "Configured keywords", value: automationCandidates.length, state: "ready" },
        { label: "Linked automations", value: 0, state: "missing" },
        { label: "Activation", value: "always manual", state: "info" }
      ],
      plan: SOL_RECIPE_STEPS.journey_automation_draft,
      suggestedConstraints: ["Create disabled automations", "Create draft journeys", "Do not message or enroll anyone"],
      inputs: { pathways: automationCandidates.map((item) => ({ slug: item.slug, title: item.title, keyword: item.primaryKeyword, destinationUrl: item.destinationUrl })) }
    });
  }

  const kpiDefinitions: Array<{ key: SolKpiTarget["key"]; label: string }> = [
    { key: "youtube", label: "YouTube videos" },
    { key: "carousel", label: "Carousels" },
    { key: "short_video", label: "Short videos" },
    { key: "post", label: "Social posts" }
  ];

  return {
    proposals,
    kpis: kpiDefinitions.map(({ key, label }) => ({ key, label, target: Math.max(0, Number(input.weeklyTargets[key]) || 0), actual: Math.max(0, Number(input.weeklyActuals[key]) || 0) })),
    coverage: {
      pathways: input.pathways.length,
      audioReady: input.pathways.filter((item) => item.audioReady).length,
      youtubePublished: input.pathways.filter((item) => item.youtubePublished).length,
      carouselPublished: input.pathways.filter((item) => item.carouselPublished > 0).length,
      automationsLinked: input.pathways.filter((item) => item.automationLinked).length
    }
  };
}

export function solProgress(completed: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}
