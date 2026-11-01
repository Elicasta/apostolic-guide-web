/**
 * Read-only Pathway reader waterfall check.
 *
 * Fixture mode proves the report without credentials:
 *   npx tsx scripts/validate-pathway-reader-funnel.ts --fixture
 *
 * Live mode reads the existing analytics.events ledger and prints aggregates only.
 * Supply NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 * Do not paste those values into chat, commits, or logs. This process sends GET
 * requests only and does not insert, update, or delete ledger rows.
 *
 *   npx tsx scripts/validate-pathway-reader-funnel.ts --days 30
 */
import { pathToFileURL } from "node:url";
import { allPathways } from "../src/pathway-catalog";
import {
  buildPathwayReaderFunnels,
  PATHWAY_READER_LEDGER,
  type PathwayReaderEvent,
  type PathwayReaderFunnel
} from "../src/pathway-reader-funnel";

const FIXTURE_CATALOG = [{
  slug: "jesus-is-god",
  title: "Jesus Is God",
  steps: [
    { title: "One", reference: "Isaiah 9:6" },
    { title: "Two", reference: "Matthew 1:23" },
    { title: "Three", reference: "John 1:1" }
  ]
}];

function fixtureEvents(): PathwayReaderEvent[] {
  const events: PathwayReaderEvent[] = [];
  for (let index = 0; index < 10; index += 1) {
    const sessionId = `fixture-${index}`;
    events.push({
      event_name: "pathway_started",
      session_id: sessionId,
      occurred_at: `2026-10-0${(index % 9) + 1}T12:00:00.000Z`,
      page_path: "/pathways/jesus-is-god",
      properties: { pathwaySlug: "jesus-is-god" }
    });
    if (index < 5) {
      events.push({
        event_name: "pathway_step_completed",
        session_id: sessionId,
        occurred_at: `2026-10-0${(index % 9) + 1}T12:01:00.000Z`,
        page_path: "/pathways/jesus-is-god",
        properties: { pathwaySlug: "jesus-is-god", stepNumber: 1 }
      });
    }
  }
  return events;
}

export function formatPathwayReaderFunnelReport(input: {
  rows: PathwayReaderFunnel[];
  days: number;
  truncated: boolean;
  source: "fixture" | "analytics.events";
}) {
  const lines = [
    `Pathway reader funnel · last ${input.days} days · ${input.source} · read-only`,
    input.truncated ? "Ledger page limit reached. Treat the totals as a partial sample." : "Ledger read completed inside the page limit."
  ];
  if (!input.rows.length) lines.push("No public reader events matched the selected window.");
  for (const row of input.rows) {
    lines.push(`${row.slug} · ${row.title}`);
    lines.push(`  opened ${row.opens} · began ${row.began} · reading complete ${row.completions} · app clicks ${row.appTransitions}`);
    lines.push(`  diagnosis: ${row.diagnosis.label} (${row.diagnosis.kind}, ${row.diagnosis.confidence})`);
    lines.push(`  ${row.diagnosis.detail}`);
    for (const step of row.steps) lines.push(`  step ${step.stepNumber}: ${step.reached}`);
  }
  return lines.join("\n");
}

function daysFromArgs(argv: string[]) {
  const flag = argv.indexOf("--days");
  const value = flag >= 0 ? Number(argv[flag + 1]) : 30;
  return Math.min(90, Math.max(7, Number.isFinite(value) ? Math.floor(value) : 30));
}

async function loadLedger(days: number) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Keep both in the environment; do not print or commit them.");
  }
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const events: PathwayReaderEvent[] = [];
  let truncated = false;
  for (let page = 0; page < PATHWAY_READER_LEDGER.maxPages; page += 1) {
    const from = page * PATHWAY_READER_LEDGER.pageSize;
    const to = from + PATHWAY_READER_LEDGER.pageSize - 1;
    const endpoint = new URL(`/rest/v1/${PATHWAY_READER_LEDGER.table}`, url);
    endpoint.searchParams.set("select", PATHWAY_READER_LEDGER.columns);
    endpoint.searchParams.set("event_name", `in.(${PATHWAY_READER_LEDGER.eventNames.join(",")})`);
    endpoint.searchParams.set("occurred_at", `gte.${since}`);
    endpoint.searchParams.set("order", "occurred_at.asc");
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Accept-Profile": PATHWAY_READER_LEDGER.schema,
        Range: `${from}-${to}`,
        "Range-Unit": "items"
      }
    });
    if (response.status === 416) break;
    if (!response.ok) {
      throw new Error(`Ledger read failed (${response.status}). No rows were changed.`);
    }
    const batch = await response.json() as PathwayReaderEvent[];
    if (!Array.isArray(batch)) throw new Error("Ledger response was not a row list.");
    events.push(...batch);
    if (batch.length < PATHWAY_READER_LEDGER.pageSize) break;
    if (page === PATHWAY_READER_LEDGER.maxPages - 1) truncated = true;
  }
  return { events, truncated };
}

async function main() {
  const fixture = process.argv.includes("--fixture");
  const days = daysFromArgs(process.argv);
  if (fixture) {
    const rows = buildPathwayReaderFunnels(fixtureEvents(), FIXTURE_CATALOG);
    process.stdout.write(`${formatPathwayReaderFunnelReport({ rows, days, truncated: false, source: "fixture" })}\n`);
    return;
  }
  const ledger = await loadLedger(days);
  const catalog = allPathways.map((pathway) => ({
    slug: pathway.slug,
    title: pathway.title,
    steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference }))
  }));
  const rows = buildPathwayReaderFunnels(ledger.events, catalog);
  process.stdout.write(`${formatPathwayReaderFunnelReport({ rows, days, truncated: ledger.truncated, source: "analytics.events" })}\n`);
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Read-only validation failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
