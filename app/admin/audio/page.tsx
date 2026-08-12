import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import { pathwayNarrationHash } from "@/pathway-audio";
import { PathwayAudioManager } from "@/pathway-audio-manager";
import { PathwayAudioMetricsRefresh } from "@/pathway-audio-metrics-refresh";
import { createServiceClient } from "@/supabase";

type AudioAssetRow = { pathway_slug: string; audio_url: string; storage_path: string | null; content_hash: string; generated_at: string };
type CheckerIssue = { severity: "error" | "warning"; category: string; quote: string | null; message: string; suggestion: string | null };
type ScriptRow = {
  pathway_slug: string;
  script_text: string;
  source_hash: string;
  script_hash: string;
  status: "draft" | "approved";
  model: string | null;
  updated_at: string;
  checker_status: "passed" | "needs_review" | null;
  checker_model: string | null;
  checked_script_hash: string | null;
  checker_result: unknown;
  checked_at: string | null;
};
type AudioMetricRow = { pathway_slug: string; starts: number | string | null; unique_listeners: number | string | null; completions: number | string | null; listened_seconds: number | string | null };
type SubscriberProgressRow = {
  subscriber_id: string;
  person_id: string;
  email: string;
  pathway_slug: string;
  first_started_at: string | null;
  last_activity_at: string;
  completed_at: string | null;
  is_completed: boolean;
  completed_by_reading: boolean;
  completed_by_audio: boolean;
  audio_starts: number | string | null;
  audio_completions: number | string | null;
  observed_reading_steps: number | string | null;
  listened_seconds: number | string | null;
};

function formatListeningTime(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function completionLabel(row: SubscriberProgressRow) {
  if (row.completed_by_audio && row.completed_by_reading) return "Completed · audio + reading";
  if (row.completed_by_audio) return "Completed · audio";
  if (row.completed_by_reading) return "Completed · reading";
  return "In progress";
}

function checkerDetails(value: unknown) {
  if (!value || typeof value !== "object") return { summary: "", issues: [] as CheckerIssue[] };
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary : "";
  const issues = Array.isArray(record.issues) ? record.issues.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const issue = item as Record<string, unknown>;
    if (typeof issue.message !== "string") return [];
    return [{
      severity: issue.severity === "error" ? "error" as const : "warning" as const,
      category: typeof issue.category === "string" ? issue.category : "editorial",
      quote: typeof issue.quote === "string" ? issue.quote : null,
      message: issue.message,
      suggestion: typeof issue.suggestion === "string" ? issue.suggestion : null
    }];
  }) : [];
  return { summary, issues };
}

function wavDownloadUrl(asset: AudioAssetRow | undefined, slug: string) {
  if (!asset?.audio_url || !asset.storage_path?.toLowerCase().endsWith(".wav")) return null;
  try {
    const url = new URL(asset.audio_url);
    url.searchParams.set("download", `apostolic-guide-${slug}.wav`);
    return url.toString();
  } catch {
    return `${asset.audio_url}${asset.audio_url.includes("?") ? "&" : "?"}download=${encodeURIComponent(`apostolic-guide-${slug}.wav`)}`;
  }
}

export default async function AdminPathwayAudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const service = createServiceClient();
  let assetRows: AudioAssetRow[] = [];
  let scriptRows: ScriptRow[] = [];
  let metricRows: AudioMetricRow[] = [];
  let subscriberProgress: SubscriberProgressRow[] = [];

  if (service) {
    const [assetsResult, scriptsResult, metricsResult, subscriberProgressResult] = await Promise.all([
      service.from("pathway_audio_assets").select("pathway_slug,audio_url,storage_path,content_hash,generated_at"),
      service.from("pathway_audio_scripts").select("pathway_slug,script_text,source_hash,script_hash,status,model,updated_at,checker_status,checker_model,checked_script_hash,checker_result,checked_at"),
      service.from("pathway_audio_metrics").select("pathway_slug,starts,unique_listeners,completions,listened_seconds"),
      service.from("subscriber_pathway_progress")
        .select("subscriber_id,person_id,email,pathway_slug,first_started_at,last_activity_at,completed_at,is_completed,completed_by_reading,completed_by_audio,audio_starts,audio_completions,observed_reading_steps,listened_seconds")
        .eq("subscriber_status", "subscribed")
        .order("last_activity_at", { ascending: false })
        .limit(100)
    ]);
    assetRows = (assetsResult.data ?? []) as AudioAssetRow[];
    scriptRows = (scriptsResult.data ?? []) as ScriptRow[];
    metricRows = (metricsResult.data ?? []) as AudioMetricRow[];
    subscriberProgress = (subscriberProgressResult.data ?? []) as SubscriberProgressRow[];
    if (metricsResult.error) console.error("pathway audio metrics load failed", { message: metricsResult.error.message, code: metricsResult.error.code });
    if (subscriberProgressResult.error) console.error("subscriber pathway progress load failed", { message: subscriberProgressResult.error.message, code: subscriberProgressResult.error.code });
  }

  const assets = new Map(assetRows.map((row) => [row.pathway_slug, row]));
  const scripts = new Map(scriptRows.map((row) => [row.pathway_slug, row]));
  const stats = new Map(metricRows.map((row) => [row.pathway_slug, {
    starts: Number(row.starts ?? 0), uniqueListeners: Number(row.unique_listeners ?? 0), completions: Number(row.completions ?? 0), listenedSeconds: Number(row.listened_seconds ?? 0)
  }]));
  const pathwayTitles = new Map(allPathways.map((pathway) => [pathway.slug, pathway.title]));

  const pathways = allPathways.map((pathway) => {
    const asset = assets.get(pathway.slug);
    const script = scripts.get(pathway.slug);
    const metric = stats.get(pathway.slug);
    const sourceCurrent = Boolean(script?.source_hash && script.source_hash === pathwayNarrationHash(pathway));
    const scriptApproved = script?.status === "approved" && sourceCurrent;
    const check = checkerDetails(script?.checker_result);
    return {
      slug: pathway.slug,
      title: pathway.title,
      estimatedMinutes: pathway.estimatedMinutes,
      audioUrl: asset?.audio_url ?? null,
      downloadUrl: wavDownloadUrl(asset, pathway.slug),
      generatedAt: asset?.generated_at ?? null,
      current: Boolean(asset?.content_hash && scriptApproved && asset.content_hash === script?.script_hash),
      scriptText: script?.script_text ?? "",
      scriptStatus: script?.status ?? null,
      scriptModel: script?.model ?? null,
      scriptUpdatedAt: script?.updated_at ?? null,
      sourceCurrent,
      checkerStatus: script?.checker_status ?? null,
      checkerModel: script?.checker_model ?? null,
      checkerCurrent: Boolean(sourceCurrent && script?.checked_script_hash && script.checked_script_hash === script.script_hash),
      checkerSummary: check.summary,
      checkerIssues: check.issues,
      checkedAt: script?.checked_at ?? null,
      starts: metric?.starts ?? 0,
      completions: metric?.completions ?? 0,
      listenedSeconds: Math.round(metric?.listenedSeconds ?? 0),
      uniqueListeners: metric?.uniqueListeners ?? 0
    };
  });

  const metricsVersion = pathways
    .map((row) => `${row.slug}:${row.starts}:${row.uniqueListeners}:${row.listenedSeconds}:${row.completions}:${row.checkerStatus}:${row.checkedAt ?? ""}`)
    .join("|");

  return <>
    <PathwayAudioMetricsRefresh />
    <PathwayAudioManager key={metricsVersion} pathways={pathways}/>

    <section className="admin-card publishing-card" style={{ marginTop: 24 }}>
      <div className="card-heading">
        <div><span className="section-kicker">Known listeners</span><h2>Subscriber Pathway activity</h2></div>
        <p>First-party activity attributed only after a visitor has been linked to a subscriber/person identity. Anonymous activity remains aggregate.</p>
      </div>
      {subscriberProgress.length ? <div className="study-table-wrap"><table className="admin-table study-table">
        <thead><tr><th>Subscriber</th><th>Pathway</th><th>Listening</th><th>Status</th><th>Last activity</th></tr></thead>
        <tbody>{subscriberProgress.map((row) => <tr key={`${row.person_id}:${row.pathway_slug}`}>
          <td><Link href={`/admin/people/${row.person_id}`}>{row.email}</Link><small>{Number(row.audio_starts ?? 0)} audio starts</small></td>
          <td><Link href={`/pathways/${row.pathway_slug}`}>{pathwayTitles.get(row.pathway_slug) ?? row.pathway_slug}</Link><small>{Number(row.observed_reading_steps ?? 0)} observed reading steps</small></td>
          <td><strong>{formatListeningTime(Number(row.listened_seconds ?? 0))}</strong><small>{Number(row.audio_completions ?? 0)} finished listens</small></td>
          <td><strong>{completionLabel(row)}</strong>{row.completed_at ? <small>{new Date(row.completed_at).toLocaleString()}</small> : null}</td>
          <td><strong>{new Date(row.last_activity_at).toLocaleString()}</strong></td>
        </tr>)}</tbody>
      </table></div> : <div className="studio-empty-state"><strong>No identified subscriber listening yet</strong><p>Once a subscriber listens from a linked browser, their Pathway progress and completion method will appear here automatically.</p></div>}
    </section>
  </>;
}
