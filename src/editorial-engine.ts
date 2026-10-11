import { createHash } from "node:crypto";
import { allPathways, type WebsitePathway } from "./pathway-catalog";
import { getPathwayKjvPassage } from "./pathway-kjv";
import { createBlankFrame, type CreativeFrame } from "./creative-project";
import { articles, answers } from "./data";
import type { BroadcastCampaign } from "./broadcast-email";

export const EDITORIAL_EPOCH = "2026-10-05";
export const EDITORIAL_TIMEZONE = "America/New_York";
export const EDITORIAL_ROTATION = ["teaching", "poster", "teaching", "app-guide", "teaching", "poster", "invitation"] as const;
export type EditorialPack = {
  date: string; lane: typeof EDITORIAL_ROTATION[number]; pathwaySlug: string; pathwayTitle: string;
  title: string; series: string; episode: number | null; sourceHash: string; frames: CreativeFrame[];
  caption: string; format: "single" | "carousel"; newsletter: BroadcastCampaign | null;
  blockers: string[]; artDirection: string;
};

export function editorialDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EDITORIAL_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function dateOrdinal(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use a calendar date in YYYY-MM-DD format.");
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error("Invalid calendar date.");
  return Math.floor(value / 86_400_000);
}
export function addEditorialDays(date: string, days: number) {
  return new Date((dateOrdinal(date) + days) * 86_400_000).toISOString().slice(0, 10);
}
export function editorialSourceHash(pathway: WebsitePathway) {
  return createHash("sha256").update(JSON.stringify({ pathway, passages: pathway.steps.map(step => getPathwayKjvPassage(step.reference)) })).digest("hex");
}
export function splitEditorialText(text: string, limit = 170) {
  const chunks: string[] = [];
  let chunk = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (chunk && `${chunk} ${word}`.length > limit) { chunks.push(chunk); chunk = ""; }
    chunk = chunk ? `${chunk} ${word}` : word;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
function frame(role: CreativeFrame["role"], headline: string, body: string, href: string, scripture = "") {
  return { ...createBlankFrame(0, role), headline, body, scripture, pathwayLink: href, altText: `${headline}. ${body}${scripture ? ` ${scripture}, KJV.` : ""}` };
}
export function buildEditorialPack(date: string, catalog = allPathways): EditorialPack {
  if (!catalog.length) throw new Error("No canonical Pathways are available.");
  const offset = dateOrdinal(date) - dateOrdinal(EDITORIAL_EPOCH);
  const day = ((offset % 7) + 7) % 7;
  const week = Math.floor(offset / 7);
  const pathway = catalog[((week % catalog.length) + catalog.length) % catalog.length];
  const lane = EDITORIAL_ROTATION[day];
  const href = `/pathways/${pathway.slug}`;
  const url = `https://www.apostolicguide.com${href}`;
  const episode = lane === "teaching" ? [0, 2, 4].indexOf(day) + 1 : null;
  // Three teaching installments cover every step once, in the canonical order.
  const start = episode ? Math.floor((episode - 1) * pathway.steps.length / 3) : day === 5 ? pathway.steps.length - 1 : 0;
  const end = episode ? Math.floor(episode * pathway.steps.length / 3) : start + 1;
  const steps = pathway.steps.slice(start, end);
  const blockers: string[] = [];
  let title = pathway.title;
  let frames: CreativeFrame[] = [];
  if (lane === "teaching") {
    title = `${pathway.title} · Part ${episode} of 3`;
    frames.push(frame("hook", title, steps[0]?.title || pathway.summary, href));
    for (const step of steps) {
      const passage = getPathwayKjvPassage(step.reference);
      if (!passage) blockers.push(`Missing full KJV text: ${step.reference}`);
      for (const verse of passage?.verses ?? []) {
        splitEditorialText(verse.text).forEach((chunk, index) => frames.push(frame("scripture", `${step.reference} · verse ${verse.number}${index ? " continued" : ""}`, chunk, href, step.reference)));
      }
      splitEditorialText(step.explanation).forEach((chunk, index) => frames.push(frame("explanation", index ? `${step.title} continued` : step.title, chunk, href)));
      if (step.hook) splitEditorialText(step.hook).forEach(chunk => frames.push(frame("support", "Why go here next?", chunk, href)));
    }
    frames.push(frame("cta", episode === 3 ? "Study the full pathway" : `Continue with Part ${episode! + 1}`, `Read the full text and explanation at apostolicguide.com${href}`, href));
  } else if (lane === "poster") {
    const step = steps[0];
    const passage = getPathwayKjvPassage(step.reference);
    if (!passage) blockers.push(`Missing full KJV text: ${step.reference}`);
    // Posters carry a complete verse. Long verses become a complete multi-frame post.
    title = `${pathway.title} · ${step.reference}`;
    const verse = passage?.verses[0];
    frames = splitEditorialText(verse?.text || "Full KJV text needs to be added before production.").map(chunk => frame("scripture", step.title, chunk, href, verse ? `${step.reference} · verse ${verse.number}` : step.reference));
  } else {
    title = lane === "app-guide" ? `How to study ${pathway.title}` : `Start here: ${pathway.title}`;
    frames = [
      frame("hook", title, pathway.summary, href),
      frame("explanation", "Open the pathway", `Visit apostolicguide.com${href}. Start at the first Scripture card.`, href),
      frame("explanation", "Read the text first", "Read the full KJV passage. The bold red words help you notice the phrases discussed in the explanation.", href),
      frame("explanation", "Follow the argument", "Read the explanation and why the next passage follows. Use Next to continue through the cards.", href),
      frame("cta", "Put it into practice", "Open the surrounding chapter, compare the connected passages, and share the pathway with someone you study with.", href)
    ];
  }
  if (frames.length > 20) blockers.push(`This draft has ${frames.length} frames. Split it into smaller posts before export.`);
  const caption = lane === "poster"
    ? `${steps[0].reference} (KJV)\n\n${steps[0].explanation}\n\nRead the passage in context and follow the study: ${url}`
    : `${title}\n\n${pathway.summary}\n\nRead the full KJV passages, explanations, and connected steps: ${url}`;
  const newsletter: BroadcastCampaign | null = day === 6 ? {
    type: "pathway", subject: `This week's study: ${pathway.title}`, previewText: pathway.summary,
    eyebrow: "Apostolic Guide · Weekly study", title: pathway.title,
    summary: `${pathway.summary}\n\nBegin with ${pathway.steps[0].reference}: ${pathway.steps[0].explanation}\n\nFollow the connected passages: ${pathway.steps.map(s => s.reference).join(" → ")}. Read the full KJV text and explanations on the website.`.slice(0, 1200),
    ctaLabel: "Study this pathway", url,
    resources: [
      ...articles.filter(a => a.topicSlug === pathway.topicSlug).slice(0, 2).map(a => ({ title: a.title, summary: a.summary, url: `https://www.apostolicguide.com/articles/${a.slug}` })),
      ...answers.filter(a => a.topicSlug === pathway.topicSlug).slice(0, 1).map(a => ({ title: a.question, summary: a.shortAnswer, url: `https://www.apostolicguide.com/answers/${a.slug}` }))
    ]
  } : null;
  return { date, lane, pathwaySlug: pathway.slug, pathwayTitle: pathway.title, title, series: `Scripture first · ${pathway.title}`, episode, sourceHash: editorialSourceHash(pathway), frames: frames.map((f, i) => ({ ...f, order: i })), caption, format: frames.length === 1 ? "single" : "carousel", newsletter, blockers,
    artDirection: "1080 × 1350 editorial artwork. Ivory paper, deep navy, restrained crimson, generous margins, large readable type. Scripture remains exact. Review every frame for clipping. Pinterest reference matching awaits the actual board." };
}
export function buildEditorialWindow(start: string, days = 14) {
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("Plan between 1 and 30 days.");
  return Array.from({ length: days }, (_, i) => buildEditorialPack(addEditorialDays(start, i)));
}

/** Publishing rechecks the canonical fingerprint even after a project was scheduled. */
export function assertEditorialSourceCurrent(input: { pathwaySlug: string; editorState: { generatedText?: Record<string, unknown> } }) {
  const generated = input.editorState.generatedText;
  if (generated?.producer !== "Editorial Engine") return;
  const pathway = allPathways.find(p => p.slug === input.pathwaySlug);
  if (!pathway || generated.sourceHash !== editorialSourceHash(pathway)) throw new Error("The editorial source changed. Reconcile the draft with the current canonical Pathway before publishing.");
  if (Array.isArray(generated.blockers) && generated.blockers.length) throw new Error("Resolve the editorial production blockers before publishing.");
}
