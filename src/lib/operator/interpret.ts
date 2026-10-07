import { allPathways } from "@/pathway-catalog";

export type OperatorInterpretation =
  | { kind: "action"; action: string; input: Record<string, unknown> }
  | { kind: "refused"; summary: string };

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchPathway(command: string) {
  const normalized = normalize(command);
  const hits = allPathways.filter((pathway) => {
    const title = normalize(pathway.title);
    const slug = normalize(pathway.slug);
    return (title.length >= 6 && normalized.includes(title)) || normalized.includes(slug);
  });
  hits.sort((left, right) => right.title.length - left.title.length);
  return hits[0] ?? null;
}

function publicAction(text: string) {
  if (/\benroll\b/.test(text) || (/\bactivate\b/.test(text) && /\bjourney\b/.test(text))) return "journey.enroll";
  if (/\bactivate\b/.test(text)) return "automation.activate";
  if (/\b(send|dm|email|broadcast|reply|message)\b/.test(text)) return "message.send";
  return "distribution.publish";
}

function isPublicIntent(text: string) {
  if (/^(status|show|list|preview|what|inspect)\b/.test(text)) return false;
  return /\b(publish|publishing|schedule|send|dm|enroll|activate|broadcast|go live)\b/.test(text);
}

function planDays(text: string) {
  const match = text.match(/(\d+)\s*day/);
  const days = match ? Number(match[1]) : 14;
  return Math.max(1, Math.min(14, days));
}

/** Resolve a workbench command to one registered action. Model text never becomes code, SQL, or a URL. */
export function interpretOperatorCommand(raw: string): OperatorInterpretation {
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return { kind: "refused", summary: "Enter a command." };
  if (text.length > 500) return { kind: "refused", summary: "Commands are limited to 500 characters." };
  const lower = text.toLowerCase();

  if (isPublicIntent(lower)) return { kind: "action", action: publicAction(lower), input: {} };
  if (/\bretry\b/.test(lower)) {
    return { kind: "refused", summary: "Job retry stays on the Sol page, where Stop Sol and execution-mode policy already apply." };
  }

  const pathway = matchPathway(lower);
  if (pathway && /\bpathway\b/.test(lower) && !/\b(list|all pathways)\b/.test(lower)) {
    return { kind: "action", action: "pathway.inspect", input: { slug: pathway.slug } };
  }
  if (/\b(proposal|approval)s?\b/.test(lower) || /\bwaiting\b/.test(lower)) {
    return { kind: "action", action: "sol.proposals.list", input: {} };
  }
  if (/\b(runs?|failed jobs?|jobs?)\b/.test(lower)) {
    return { kind: "action", action: "sol.runs.list", input: {} };
  }
  if (/\bcreative\b/.test(lower) || (/\bprojects?\b/.test(lower) && !/\bpathway\b/.test(lower))) {
    return { kind: "action", action: "creative.projects.list", input: {} };
  }
  if (/\bfeed\b/.test(lower)) return { kind: "action", action: "feed.preview", input: {} };
  if (/\b(plan|calendar|next \d+ days)\b/.test(lower)) {
    return { kind: "action", action: "content.plan.preview", input: { days: planDays(lower) } };
  }
  if (pathway) return { kind: "action", action: "pathway.inspect", input: { slug: pathway.slug } };
  if (/\bpathway/.test(lower)) return { kind: "action", action: "pathway.list", input: {} };
  if (/^(status|help)$/.test(lower) || /\b(attention|blocking|behind|workspace|kpi)\b/.test(lower)) {
    return { kind: "action", action: "workspace.status", input: {} };
  }
  return { kind: "refused", summary: "That command is not a registered Grokbot action. Try status, list pathways, show proposals, or preview feed." };
}
