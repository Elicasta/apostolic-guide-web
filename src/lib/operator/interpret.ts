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

  if (/\b(update|edit|reorder|overwrite)\b/.test(lower) && /\bplan\b/.test(lower)) {
    return { kind: "refused", summary: "Name the plan to change, or use the Planning Desk. Grokbot will not guess which draft to overwrite." };
  }
  if (/\b(create|save|start)\b/.test(lower) && /\bplan\b/.test(lower) && !/\b(preview|show)\b/.test(lower)) {
    return { kind: "action", action: "plan.create", input: { days: planDays(lower) } };
  }
  if (/\bplans\b/.test(lower) || (/\blist\b/.test(lower) && /\bplan\b/.test(lower))) {
    return { kind: "action", action: "plan.list", input: {} };
  }
  const namedId = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i)?.[0];
  if (namedId && /\bplan\b/.test(lower) && /\b(open|inspect|reopen|show)\b/.test(lower)) {
    return { kind: "action", action: "plan.inspect", input: { planId: namedId } };
  }
  if (namedId && /\bpreview\b/.test(lower) && /\bplan\b/.test(lower)) {
    return { kind: "action", action: "plan.preview", input: { planId: namedId } };
  }
  if (/\barchive\b/.test(lower) && /\bsession\b/.test(lower)) {
    if (!namedId) return { kind: "refused", summary: "Use the session menu to archive. Grokbot will not guess which session." };
    return { kind: "action", action: "session.archive", input: { sessionId: namedId } };
  }
  if (/\bsessions\b/.test(lower)) return { kind: "action", action: "session.list", input: {} };
  if (/\bscratch\b/.test(lower) && /\b(save|write|store)\b/.test(lower)) {
    return { kind: "refused", summary: "Use the scratch pad to save text. A command needs the saved note, not a guess." };
  }
  if (/\bscratch\b/.test(lower)) return { kind: "action", action: "scratch.list", input: {} };
  if (/\bupload\b/.test(lower)) {
    return { kind: "refused", summary: "Use the drop zone. Uploads go through Pathway Assets and are not claimed from a command." };
  }
  if (/\bassets?\b/.test(lower) && /\b(list|show|linked)\b/.test(lower)) return { kind: "action", action: "asset.list", input: {} };

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
