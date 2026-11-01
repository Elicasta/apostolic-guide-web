import { NextResponse } from "next/server";
import { getAdminAccess } from "@/auth";
import { buildAnalyticsV3Signals, buildDeterministicAnalyticsBrief } from "@/analytics-v3";
import { loadAnalyticsV3 } from "@/analytics-v3-server";
import { getSearchConsoleSnapshot } from "@/google-search-console";
import { allPathways } from "@/pathway-catalog";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string } | null;
};

function extractText(payload: ResponsesPayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text?.trim()) return part.text.trim();
    }
  }
  return "";
}

function safeJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned) as Record<string, unknown>; } catch { return null; }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 6) : [];
}

export async function POST() {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.role || !hasStudioPermission(access.role, "view_analytics")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const loaded = await loadAnalyticsV3();
  if (!loaded.snapshot) return NextResponse.json({ error: loaded.error || "Analytics are unavailable." }, { status: 503 });

  const catalog = new Map(allPathways.map((pathway) => [pathway.slug, pathway]));
  const pathwayRows = loaded.snapshot.pathways
    .map((row) => {
      const pathway = catalog.get(row.slug);
      return pathway ? { ...row, title: pathway.title, collection: pathway.collection } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const signals = buildAnalyticsV3Signals(loaded.snapshot, pathwayRows);
  const deterministic = buildDeterministicAnalyticsBrief(loaded.snapshot, signals);
  const searchConsole = await getSearchConsoleSnapshot();

  const evidence = [
    { label: "Public visitors", value: String(loaded.snapshot.period.current.visitors) },
    { label: "Prior visitors", value: String(loaded.snapshot.period.previous.visitors) },
    { label: "Public sessions", value: String(loaded.snapshot.period.current.sessions) },
    { label: "Engaged studies", value: String(loaded.snapshot.period.current.engagedStudySessions) },
    { label: "Prior engaged studies", value: String(loaded.snapshot.period.previous.engagedStudySessions) },
    { label: "Pathway starts", value: String(loaded.snapshot.period.current.pathwayStartSessions) },
    { label: "Pathway completions", value: String(loaded.snapshot.period.current.pathwayCompletionSessions) },
    { label: "App transitions", value: String(loaded.snapshot.period.current.appTransitionSessions) }
  ];

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      mode: "deterministic",
      provider: null,
      summary: deterministic.summary,
      observed: deterministic.observations,
      interpretation: ["AI interpretation is not configured. The deterministic decision engine remains fully active."],
      recommendations: [deterministic.recommendation],
      evidence
    });
  }

  const facts = {
    period: loaded.snapshot.period,
    acquisition: loaded.snapshot.acquisition.slice(0, 8),
    pathways: pathwayRows.slice(0, 12).map((row) => ({
      title: row.title,
      collection: row.collection,
      starts: row.starts,
      priorStarts: row.priorStarts,
      reach25: row.reach25,
      reach50: row.reach50,
      reach75: row.reach75,
      completions: row.completions,
      completionRate: row.completionRate,
      averageProgress: row.averageProgress
    })),
    signals: signals.map((signal) => ({
      severity: signal.severity,
      title: signal.title,
      detail: signal.detail,
      confidence: signal.confidence,
      evidence: signal.evidence
    })),
    devices: loaded.snapshot.devices.slice(0, 6),
    countries: loaded.snapshot.countries.slice(0, 8),
    googleSearchConsole: searchConsole.current && searchConsole.previous ? {
      current: {
        startDate: searchConsole.current.startDate,
        endDate: searchConsole.current.endDate,
        clicks: searchConsole.current.clicks,
        impressions: searchConsole.current.impressions,
        ctr: searchConsole.current.ctr,
        position: searchConsole.current.position
      },
      previous: {
        startDate: searchConsole.previous.startDate,
        endDate: searchConsole.previous.endDate,
        clicks: searchConsole.previous.clicks,
        impressions: searchConsole.previous.impressions,
        ctr: searchConsole.previous.ctr,
        position: searchConsole.previous.position
      }
    } : null,
    policy: {
      deterministicSourceOfTruth: true,
      mayInventMetrics: false,
      mayOverrideRules: false,
      rawSearchTextIncluded: false,
      privateMessagesIncluded: false,
      privateNotesIncluded: false
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_SOL_OPERATOR_MODEL?.trim() || "gpt-5.6-sol",
        instructions: [
          "You are Sol interpreting Apostolic Guide Analytics V3.",
          "The supplied JSON is the complete factual boundary for this response.",
          "Never invent, recalculate, replace, or silently correct a metric.",
          "Distinguish OBSERVED FACT from INTERPRETATION from RECOMMENDATION.",
          "Do not claim causation from correlation. Say likely, may, or appears when interpreting.",
          "Respect confidence/sample size. Do not hype a small denominator.",
          "Be concise and operational. Tell the operator what changed, why it may matter, and the one or two strongest moves to make next.",
          "Return JSON only with keys summary, observed, interpretation, recommendations. Each list must contain short strings."
        ].join("\n"),
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(facts) }] }],
        reasoning: { effort: "medium" },
        text: { verbosity: "low" }
      })
    });
    const payload = await response.json().catch(() => ({})) as ResponsesPayload;
    if (!response.ok) throw new Error(payload.error?.message || `Sol model request failed (${response.status}).`);
    const parsed = safeJson(extractText(payload));
    if (!parsed) throw new Error("Sol returned an unreadable analytics interpretation.");
    return NextResponse.json({
      mode: "sol",
      provider: process.env.OPENAI_SOL_OPERATOR_MODEL?.trim() || "gpt-5.6-sol",
      summary: typeof parsed.summary === "string" ? parsed.summary : deterministic.summary,
      observed: stringArray(parsed.observed),
      interpretation: stringArray(parsed.interpretation),
      recommendations: stringArray(parsed.recommendations),
      evidence
    });
  } catch {
    return NextResponse.json({
      mode: "deterministic",
      provider: null,
      summary: deterministic.summary,
      observed: deterministic.observations,
      interpretation: ["Sol was unavailable, so no AI inference was added."],
      recommendations: [deterministic.recommendation],
      evidence
    });
  } finally {
    clearTimeout(timer);
  }
}
