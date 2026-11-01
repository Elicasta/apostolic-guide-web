import { z } from "zod";
import { APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES } from "./pathway-audio-script";
import { selectedEpisodeThumbnail, selectedEpisodeTitle, type EpisodeGrowthPlan } from "./video-producer-growth";

export const EPISODE_FORMATS = ["solo", "dialogue", "panel"] as const;
export type EpisodeFormat = typeof EPISODE_FORMATS[number];

export const episodeSpeakerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  role: z.string().trim().min(1).max(100).default("host")
});
export type EpisodeSpeaker = z.infer<typeof episodeSpeakerSchema>;

export const episodeReviewSchema = z.object({
  verdict: z.enum(["passed", "needs_review"]),
  summary: z.string().max(1000),
  checks: z.array(z.object({
    id: z.enum(["theology", "scripture", "source", "conversation", "practical_application"]),
    status: z.enum(["pass", "warning", "fail"]),
    message: z.string().max(800)
  })).min(5).max(5),
  issues: z.array(z.object({
    severity: z.enum(["error", "warning"]),
    category: z.enum(["theology", "scripture", "source", "conversation", "practical_application"]),
    quote: z.string().max(500).nullable(),
    message: z.string().max(1000),
    suggestion: z.string().max(1200).nullable()
  })).max(20)
});
export type EpisodeReview = z.infer<typeof episodeReviewSchema>;

export function episodeFormatLabel(format: EpisodeFormat) {
  if (format === "dialogue") return "Two-person conversation";
  if (format === "panel") return "Panel conversation";
  return "Solo episode";
}

function growthContract(plan: EpisodeGrowthPlan) {
  const thumbnail = selectedEpisodeThumbnail(plan);
  return [
    `SELECTED YOUTUBE TITLE: ${selectedEpisodeTitle(plan)}`,
    `SELECTED THUMBNAIL COPY: ${thumbnail?.copy || ""}`,
    `SELECTED THUMBNAIL VISUAL: ${thumbnail?.visual || ""}`,
    `VIEWER STATE: ${plan.audience.viewerState}`,
    `VIEWER TENSION: ${plan.audience.tension}`,
    `EPISODE PROMISE: ${plan.audience.promise}`,
    `EXPECTED PAYOFF: ${plan.audience.payoff}`,
    `CLICK REASON: ${plan.packaging.clickReason}`,
    `DELIVERY EXPECTATION: ${plan.packaging.deliveryExpectation}`,
    `0–30 SECOND HOOK: ${plan.retention.hook}`,
    "FIRST-MINUTE BEATS:",
    ...plan.retention.firstMinuteBeats.map((beat, index) => `${index + 1}. ${beat}`),
    "OPEN LOOPS TO CLOSE:",
    ...plan.retention.openLoops.map((loop, index) => `${index + 1}. ${loop}`),
    "PATTERN INTERRUPTS / IDEA RESETS:",
    ...plan.retention.patternInterrupts.map((beat, index) => `${index + 1}. ${beat}`),
    `FINAL PAYOFF: ${plan.retention.payoff}`
  ].join("\n");
}

export function buildEpisodeGenerationPrompt(input: {
  title: string;
  premise: string;
  format: EpisodeFormat;
  speakers: EpisodeSpeaker[];
  pathwaySource: string;
  growthPlan: EpisodeGrowthPlan;
}) {
  const speakers = input.speakers.map((speaker) => `${speaker.name} — ${speaker.role}`).join("\n");
  const dialogueRules = input.format === "solo" ? [
    "Write one natural spoken voice. The host should teach, reflect, give practical examples, and move through the topic without sounding like a sermon manuscript pasted into a podcast."
  ] : [
    "Write an actual conversation, not alternating monologues.",
    "Speakers should ask questions, clarify, interrupt lightly, disagree with weak framing when useful, restate ideas in ordinary language, and build on each other.",
    "Do not make every response the same length. Short interjections and follow-up questions are welcome.",
    "Keep every speaker inside the same Apostolic theological frame. A speaker may raise a common objection or practical tension, but the script must resolve it accurately.",
    "Prefix every spoken turn with the speaker name followed by a colon."
  ];

  return [
    "Write a YouTube-first Apostolic Guide episode script.",
    "The episode may be practical, pastoral, cultural, devotional, or doctrinal, but its theology and Scripture claims must stay grounded in the supplied Apostolic Guide Pathways.",
    "The growth plan below is a delivery contract, not optional inspiration. The title and thumbnail earn the click. The script must fulfill the exact promise they create.",
    "Do not bait-and-switch. Do not repeat the title and thumbnail as empty hype. Earn the opening by resolving the tension through the episode.",
    `EDITOR WORKING TITLE: ${input.title}`,
    `PREMISE / THOUGHT FROM THE EDITOR: ${input.premise}`,
    `FORMAT: ${episodeFormatLabel(input.format)}`,
    "SPEAKERS:", speakers,
    "",
    "YOUTUBE PACKAGE + RETENTION CONTRACT",
    growthContract(input.growthPlan),
    "",
    "VOICE",
    "- Natural, intelligent, warm, direct, and Scripture-first.",
    "- Teach like a real teacher speaking to a person. Do not become a hyperactive YouTuber.",
    "- Practical application matters. It is acceptable to discuss work, family, culture, friendships, holiness, identity, prayer, evangelism, leadership, suffering, technology, or daily decisions when relevant to the premise.",
    "- Do not manufacture culture-war outrage, attack other Christians, or force every practical observation into a doctrinal debate.",
    "- Distinguish biblical teaching from pastoral application. Do not present a practical recommendation as though it were an explicit verse.",
    "- Never invent Scripture quotations. Prefer references and paraphrase only what the supplied Pathway source actually supports.",
    "- Do not introduce outside proof texts, historical claims, statistics, or attributed quotations unless they are explicitly supplied by the editor.",
    "- Use the planned first-minute beats naturally. The first 30 seconds must establish the promised tension and why the viewer should stay.",
    "- Close every open loop you introduce. Do not create questions that the episode never resolves.",
    "- Pattern interrupts are content resets, not stage directions. Let idea changes, questions, examples, Scripture moments, objections, and applications create those beats in the spoken structure.",
    "- Build toward the promised payoff rather than front-loading every proof point.",
    "- End with a useful takeaway and a natural invitation to continue studying the relevant Pathway on Apostolic Guide.",
    "- Output only the finished script. Do not add markdown headings, production notes, sound cues, or analysis.",
    "- Aim for a useful mini episode, normally 6–15 minutes when spoken. Depth should follow the premise rather than a fixed word count.",
    ...dialogueRules,
    "",
    APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES,
    "",
    "CANONICAL PATHWAY SOURCE",
    "--- SOURCE START ---",
    input.pathwaySource,
    "--- SOURCE END ---"
  ].join("\n");
}

export function buildEpisodeReviewPrompt(input: {
  premise: string;
  format: EpisodeFormat;
  speakers: EpisodeSpeaker[];
  pathwaySource: string;
  scriptText: string;
  growthPlan: EpisodeGrowthPlan;
}) {
  return `You are the rigid editorial and theological checker for an Apostolic Guide YouTube episode.

Review the episode against the supplied Pathway source, Apostolic Oneness rules, and the YouTube package contract. The episode may make practical applications that are not direct Scripture quotations, but it may not invent biblical claims, proof texts, historical facts, or doctrinal conclusions outside the supplied source.

The package is also a truthfulness contract. The script must actually answer the tension, promise, and payoff that earned the click. If the script materially fails to fulfill the selected title/thumbnail promise, report that as a conversation warning or failure. Do not allow clickbait to pass approval merely because the theology is correct.

${APOSTOLIC_GUIDE_ONENESS_AUDIO_RULES}

CHECK EXACTLY FIVE AREAS
1. theology — The episode remains within Apostolic Oneness theology and never affirms conflicting person-language, eternal-Son personhood, multiple divine centers, or mask language.
2. scripture — References and paraphrases are faithful to the supplied Pathways. No invented quotations or outside proof texts.
3. source — Doctrinal claims are supportable from the supplied Pathways. Practical application may extend beyond the wording of the source only when clearly presented as application, wisdom, example, or judgment.
4. conversation — For dialogue/panel formats, the speakers sound like a real conversation rather than alternating essays. For solo, spoken flow should be natural and coherent. The episode must also fulfill the selected package promise without bait-and-switch.
5. practical_application — Application is responsible, pastoral, and does not turn preference, speculation, or cultural opinion into a command of Scripture.

Return "passed" only when no material issue should stop approval. A warning still requires editorial review before approval.

Return ONLY valid JSON in exactly this shape:
{
  "verdict": "passed" | "needs_review",
  "summary": "one concise sentence",
  "checks": [
    {"id":"theology","status":"pass|warning|fail","message":"reason"},
    {"id":"scripture","status":"pass|warning|fail","message":"reason"},
    {"id":"source","status":"pass|warning|fail","message":"reason"},
    {"id":"conversation","status":"pass|warning|fail","message":"reason"},
    {"id":"practical_application","status":"pass|warning|fail","message":"reason"}
  ],
  "issues": [{"severity":"error|warning","category":"theology|scripture|source|conversation|practical_application","quote":"small excerpt or null","message":"problem","suggestion":"specific correction or null"}]
}

EPISODE PREMISE
${input.premise}

FORMAT
${episodeFormatLabel(input.format)}
Speakers: ${input.speakers.map((speaker) => `${speaker.name} (${speaker.role})`).join(", ")}

YOUTUBE PACKAGE CONTRACT
${growthContract(input.growthPlan)}

CANONICAL PATHWAY SOURCE
--- SOURCE START ---
${input.pathwaySource}
--- SOURCE END ---

PROPOSED EPISODE
--- SCRIPT START ---
${input.scriptText}
--- SCRIPT END ---`;
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

export async function generateEpisodeScript(input: { apiKey: string; model: string; prompt: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, reasoning: { effort: "medium" }, text: { verbosity: "medium" }, input: input.prompt, max_output_tokens: 9000 })
  });
  if (!response.ok) throw new Error(`Episode generation failed (${response.status}). ${(await response.text().catch(() => "")).slice(0, 900)}`);
  const text = extractResponseText(await response.json());
  if (!text) throw new Error("Episode generation returned no script.");
  return text;
}

export async function reviewEpisodeScript(input: { apiKey: string; model: string; prompt: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, input: input.prompt, max_output_tokens: 2400 })
  });
  if (!response.ok) throw new Error(`Episode theology check failed (${response.status}). ${(await response.text().catch(() => "")).slice(0, 900)}`);
  const text = extractResponseText(await response.json()).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return episodeReviewSchema.parse(JSON.parse(text)); }
  catch { throw new Error("Episode theology checker returned an invalid result. Run the check again."); }
}
