import { allPathways } from "../../pathway-catalog";

export type SolKnownIntent =
  | { intent: "prepare_pathway_campaign"; workflowKey: "apostolic.pathway_campaign.prepare"; workflowVersion: 1; input: { pathway: string }; identity: Record<string, unknown> }
  | { intent: "test_and_verify_site"; workflowKey: "test_and_verify_site"; workflowVersion: 1; input: { url: string; expectedStatus: number; textIncludes: string[]; textExcludes: string[] }; identity: Record<string, unknown> }
  | { intent: "research_and_report"; workflowKey: "research_and_report"; workflowVersion: 1; input: { query: string; urls: string[] }; identity: Record<string, unknown> }
  | { intent: "build_and_deploy"; workflowKey: "build_and_deploy"; workflowVersion: 1; input: Record<string, unknown>; identity: Record<string, unknown> };

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9:/._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function pathwayFromText(message: string) {
  const normalized = normalize(message);
  const bySpecificity = [...allPathways].sort((a, b) => b.title.length - a.title.length);
  for (const pathway of bySpecificity) {
    const title = normalize(pathway.title);
    const slugWords = pathway.slug.replaceAll("-", " ");
    if (normalized.includes(title) || normalized.includes(slugWords) || normalized.includes(pathway.slug)) return pathway;
  }
  return null;
}

function urlsFromText(message: string) {
  const matches = message.match(/https:\/\/[^\s<>"')\]]+/gi) ?? [];
  return [...new Set(matches.map((url) => url.replace(/[.,;!?]+$/, "")))].slice(0, 12);
}

function campaignRequest(message: string) {
  const normalized = normalize(message);
  return /\b(prepare|create|build|make|run|start)\b/.test(normalized) && /\b(campaign|pathway campaign)\b/.test(normalized);
}

export function interpretKnownSolIntent(message: string): SolKnownIntent | null {
  const normalized = normalize(message);
  const pathway = pathwayFromText(message);
  if (pathway && campaignRequest(message)) {
    return {
      intent: "prepare_pathway_campaign",
      workflowKey: "apostolic.pathway_campaign.prepare",
      workflowVersion: 1,
      input: { pathway: pathway.slug },
      identity: { pathway: pathway.slug, outcome: "review_ready_campaign" }
    };
  }

  const urls = urlsFromText(message);
  if (urls.length && /\b(test|verify|smoke|check)\b/.test(normalized) && /\b(site|page|url|website)\b/.test(normalized)) {
    return {
      intent: "test_and_verify_site",
      workflowKey: "test_and_verify_site",
      workflowVersion: 1,
      input: { url: urls[0], expectedStatus: 200, textIncludes: [], textExcludes: [] },
      identity: { url: urls[0], expectedStatus: 200 }
    };
  }

  if (urls.length && /\b(research|report|investigate|compare)\b/.test(normalized)) {
    return {
      intent: "research_and_report",
      workflowKey: "research_and_report",
      workflowVersion: 1,
      input: { query: message.replace(/https:\/\/[^\s<>"')\]]+/gi, "").trim() || "Research report", urls },
      identity: { query: normalize(message.replace(/https:\/\/[^\s<>"')\]]+/gi, "")), urls: [...urls].sort() }
    };
  }

  return null;
}
