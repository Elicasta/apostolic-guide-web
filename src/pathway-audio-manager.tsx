"use client";

import { useMemo, useState } from "react";

const MAX_SCRIPT_CHARS = 20_000;

type CheckerIssue = {
  severity: "error" | "warning";
  category: string;
  quote: string | null;
  message: string;
  suggestion: string | null;
};

type PathwayRow = {
  slug: string;
  title: string;
  estimatedMinutes: number;
  audioUrl: string | null;
  downloadUrl: string | null;
  generatedAt: string | null;
  current: boolean;
  scriptText: string;
  scriptStatus: "draft" | "approved" | null;
  scriptModel: string | null;
  scriptUpdatedAt: string | null;
  sourceCurrent: boolean;
  checkerStatus: "passed" | "needs_review" | null;
  checkerModel: string | null;
  checkerCurrent: boolean;
  checkerSummary: string;
  checkerIssues: CheckerIssue[];
  checkedAt: string | null;
  starts: number;
  completions: number;
  listenedSeconds: number;
  uniqueListeners: number;
};

function formatListeningTime(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function completionRate(row: PathwayRow) {
  return row.starts ? `${Math.round((row.completions / row.starts) * 100)}%` : "0%";
}

function scriptLabel(row: PathwayRow) {
  if (!row.scriptText) return "No script";
  if (!row.sourceCurrent) return "Review needed";
  return row.scriptStatus === "approved" ? "Approved" : "Draft";
}

function scriptStatusClass(row: PathwayRow) {
  if (!row.scriptText) return "is-missing";
  if (!row.sourceCurrent || row.scriptStatus !== "approved") return "is-review";
  return "is-approved";
}

function checkerLabel(row: PathwayRow) {
  if (!row.scriptText) return "Not checked";
  if (!row.checkerCurrent) return "Needs check";
  if (row.checkerStatus === "passed") return "Passed";
  if (row.checkerStatus === "needs_review") return "Needs review";
  return "Not checked";
}

function checkerStatusClass(row: PathwayRow) {
  if (row.checkerCurrent && row.checkerStatus === "passed") return "is-approved";
  if (row.checkerCurrent && row.checkerStatus === "needs_review") return "is-review";
  return "is-missing";
}

function audioLabel(row: PathwayRow) {
  if (!row.audioUrl) return "Missing";
  return row.current ? "Current" : "Outdated";
}

function audioStatusClass(row: PathwayRow) {
  if (!row.audioUrl) return "is-missing";
  return row.current ? "is-current" : "is-outdated";
}

function parseCheckerIssues(value: unknown): CheckerIssue[] {
  if (!value || typeof value !== "object") return [];
  const issues = (value as Record<string, unknown>).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((item) => {
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
  });
}

function checkerSummary(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const summary = (value as Record<string, unknown>).summary;
  return typeof summary === "string" ? summary : "";
}

function makeWavDownloadUrl(audioUrl: string, slug: string) {
  try {
    const url = new URL(audioUrl);
    url.searchParams.set("download", `apostolic-guide-${slug}.wav`);
    return url.toString();
  } catch {
    return `${audioUrl}${audioUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(`apostolic-guide-${slug}.wav`)}`;
  }
}

export function PathwayAudioManager({ pathways }: { pathways: PathwayRow[] }) {
  const [rows, setRows] = useState(pathways);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(pathways.map((row) => [row.slug, row.scriptText])));
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const totalStarts = rows.reduce((sum, row) => sum + row.starts, 0);
  const totalCompletions = rows.reduce((sum, row) => sum + row.completions, 0);
  const totalListeningSeconds = rows.reduce((sum, row) => sum + row.listenedSeconds, 0);
  const approvedCount = rows.filter((row) => row.scriptStatus === "approved" && row.sourceCurrent).length;
  const currentCount = rows.filter((row) => row.current).length;
  const needsReview = useMemo(() => rows.filter((row) => row.scriptText && (!row.sourceCurrent || row.scriptStatus !== "approved")).length, [rows]);

  function revealEditor(slug: string) {
    setOpenSlug(slug);
    window.setTimeout(() => document.getElementById("pathway-audio-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  function applyScriptResponse(slug: string, script: Record<string, unknown>) {
    const result = script.checker_result;
    const nextText = typeof script.script_text === "string" ? script.script_text : drafts[slug] ?? "";
    setDrafts((current) => ({ ...current, [slug]: nextText }));
    setRows((current) => current.map((row) => row.slug === slug ? {
      ...row,
      scriptText: nextText,
      scriptStatus: script.status === "approved" ? "approved" : "draft",
      scriptModel: typeof script.model === "string" ? script.model : row.scriptModel,
      scriptUpdatedAt: typeof script.updated_at === "string" ? script.updated_at : row.scriptUpdatedAt,
      sourceCurrent: true,
      checkerStatus: script.checker_status === "passed" || script.checker_status === "needs_review" ? script.checker_status : null,
      checkerModel: typeof script.checker_model === "string" ? script.checker_model : null,
      checkerCurrent: Boolean(script.checked_script_hash && script.checked_script_hash === script.script_hash),
      checkerSummary: checkerSummary(result),
      checkerIssues: parseCheckerIssues(result),
      checkedAt: typeof script.checked_at === "string" ? script.checked_at : null,
      current: script.status === "approved" ? row.current : false
    } : row));
  }

  async function checkScript(slug: string, scriptText: string) {
    const response = await fetch("/api/admin/pathway-audio/script/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, scriptText })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Script check failed.");
    applyScriptResponse(slug, data.script ?? {});
    return data as { script?: Record<string, unknown>; check?: { verdict?: string; summary?: string; issues?: unknown[] } };
  }

  async function generateScript(slug: string) {
    setRunning(`script:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/script/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Script generation failed.");
      applyScriptResponse(slug, data.script ?? {});
      revealEditor(slug);
      if (data.check?.verdict === "passed") setMessage("Draft generated. Script checker passed. Approve it when the wording is ready.");
      else if (data.check?.verdict === "needs_review") setMessage(`Draft generated. Script checker found ${Array.isArray(data.check.issues) ? data.check.issues.length : 1} item(s) to review.`);
      else setMessage(data.checkerError ? `Draft generated, but the automatic script check could not finish: ${data.checkerError}` : "Draft generated. Run the script checker before approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script generation failed.");
    } finally { setRunning(null); }
  }

  async function saveScript(slug: string) {
    const scriptText = (drafts[slug] ?? "").trim();
    setRunning(`save:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/script", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, scriptText, action: "save" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Script save failed.");
      applyScriptResponse(slug, data.script ?? {});
      setMessage("Draft saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script save failed.");
    } finally { setRunning(null); }
  }

  async function manuallyCheckScript(slug: string) {
    const scriptText = (drafts[slug] ?? "").trim();
    setRunning(`check:${slug}`);
    setMessage("");
    try {
      const data = await checkScript(slug, scriptText);
      if (data.check?.verdict === "passed") setMessage("Script checker passed. No publication-blocking issues found.");
      else setMessage(`Script checker found ${Array.isArray(data.check?.issues) ? data.check.issues.length : 1} item(s) to review before approval.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script check failed.");
    } finally { setRunning(null); }
  }

  async function approveScript(slug: string) {
    const scriptText = (drafts[slug] ?? "").trim();
    const currentRow = rows.find((row) => row.slug === slug);
    setRunning(`approve:${slug}`);
    setMessage("");
    try {
      if (currentRow?.checkerCurrent && currentRow.checkerStatus === "needs_review" && scriptText === currentRow.scriptText) {
        setMessage("The current script check still has review items. Fix the flagged wording, then approve again, or use Recheck if you want the checker to evaluate it again.");
        return;
      }

      const alreadyPassed = currentRow?.checkerCurrent && currentRow.checkerStatus === "passed" && scriptText === currentRow.scriptText;
      if (!alreadyPassed) {
        const checked = await checkScript(slug, scriptText);
        if (checked.check?.verdict !== "passed") {
          setMessage(`Script checker found ${Array.isArray(checked.check?.issues) ? checked.check.issues.length : 1} item(s). Approval stopped until they are resolved.`);
          return;
        }
      }

      const response = await fetch("/api/admin/pathway-audio/script", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, scriptText, action: "approve" }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Script approval failed.");
      applyScriptResponse(slug, data.script ?? {});
      setMessage("Script checker passed. Script approved. Audio can now be generated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Script approval failed.");
    } finally { setRunning(null); }
  }

  async function generateAudio(slug: string, force = false) {
    setRunning(`audio:${slug}`);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pathway-audio/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, force }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Audio generation failed.");
      const asset = data.asset;
      setRows((current) => current.map((row) => row.slug === slug ? {
        ...row,
        audioUrl: asset.audio_url,
        downloadUrl: data.format === "wav" || String(asset.audio_url ?? "").toLowerCase().includes(".wav") ? makeWavDownloadUrl(asset.audio_url, slug) : row.downloadUrl,
        generatedAt: asset.generated_at,
        current: true
      } : row));
      const segments = typeof data.segments === "number" ? data.segments : 1;
      setMessage(segments > 1 ? `Audio generated from the approved script and assembled from ${segments} TTS-safe segments.` : "Audio generated from the approved script.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio generation failed.");
    } finally { setRunning(null); }
  }

  const openRow = openSlug ? rows.find((item) => item.slug === openSlug) ?? null : null;

  return <div className="pathway-audio-page">
    <div className="studio-page-heading pathway-audio-heading">
      <div><span className="eyebrow">Publishing</span><h1>Pathway audio</h1><p className="admin-lede">Generate a canonical Pathway narration, run the Apostolic theology and Scripture checker, approve the exact wording, then create the mastered public WAV. Edited drafts are automatically re-checked before approval.</p></div>
    </div>

    <div className="pathway-audio-metrics">
      <div className="metric"><strong>{approvedCount}/{rows.length}</strong><span>Scripts approved</span></div>
      <div className="metric"><strong>{needsReview}</strong><span>Need review</span></div>
      <div className="metric"><strong>{currentCount}/{rows.length}</strong><span>Audio current</span></div>
      <div className="metric"><strong>{totalStarts}</strong><span>Audio starts</span></div>
      <div className="metric"><strong>{formatListeningTime(totalListeningSeconds)}</strong><span>Total listening</span></div>
      <div className="metric"><strong>{totalCompletions}</strong><span>Completed listens</span></div>
    </div>

    {message ? <div className="admin-notice">{message}</div> : null}

    {openRow ? (() => {
      const row = openRow;
      const text = drafts[row.slug] ?? "";
      const approved = row.scriptStatus === "approved" && row.sourceCurrent;
      const busy = Boolean(running);
      const checkPassed = row.checkerCurrent && row.checkerStatus === "passed";
      const checkNeedsReview = row.checkerCurrent && row.checkerStatus === "needs_review";
      return <section id="pathway-audio-editor" className="admin-card pathway-audio-editor">
        <div className="pathway-audio-editor-head">
          <div><span className="eyebrow">Script → Check → Approve → Audio</span><h2>{row.title}</h2><p>{!row.sourceCurrent && row.scriptText ? "The canonical Pathway changed. Regenerate or update this script; the checker must pass again before approval." : "Generated drafts are checked against the canonical Pathway, Apostolic Oneness theology, Scripture fidelity, platform-neutral delivery, and narration formatting. If you edit the text, approval checks the exact edited version automatically."}</p></div>
          <button className="button" type="button" disabled={busy} onClick={() => generateScript(row.slug)}>{running === `script:${row.slug}` ? "Generating + checking…" : row.scriptText ? "Regenerate draft" : "Generate draft"}</button>
        </div>
        <div className="pathway-audio-editor-body">
          <textarea className="pathway-audio-textarea" value={text} onChange={(event) => {
            const value = event.target.value.slice(0, MAX_SCRIPT_CHARS);
            setDrafts((current) => ({ ...current, [row.slug]: value }));
            setRows((current) => current.map((item) => item.slug === row.slug ? {
              ...item,
              scriptStatus: item.scriptStatus === "approved" && value === item.scriptText ? "approved" : "draft",
              checkerCurrent: value === item.scriptText ? item.checkerCurrent : false,
              current: value === item.scriptText ? item.current : false
            } : item));
          }} placeholder="Generate a draft or write the narration here…" />

          <div className={`pathway-script-check ${checkPassed ? "is-passed" : checkNeedsReview ? "is-review" : "is-pending"}`}>
            <div className="pathway-script-check-head">
              <div><span>Script checker</span><strong>{checkerLabel(row)}</strong></div>
              {row.checkedAt && row.checkerCurrent ? <small>{new Date(row.checkedAt).toLocaleString()}{row.checkerModel ? ` · ${row.checkerModel}` : ""}</small> : null}
            </div>
            <p>{!row.checkerCurrent && row.scriptText ? "This draft changed after its last check. Clicking Approve will check this exact text automatically." : row.checkerSummary || (checkPassed ? "Theology, Scripture/source fidelity, delivery, and formatting passed." : "Generated drafts are checked automatically. You can also run the checker at any time.")}</p>
            {row.checkerCurrent && row.checkerIssues.length ? <div className="pathway-script-check-issues">{row.checkerIssues.map((issue, index) => <article key={`${issue.category}:${index}`}>
              <div><strong>{issue.category}</strong><span>{issue.severity}</span></div>
              {issue.quote ? <blockquote>{issue.quote}</blockquote> : null}
              <p>{issue.message}</p>
              {issue.suggestion ? <small>Fix: {issue.suggestion}</small> : null}
            </article>)}</div> : null}
          </div>

          <div className="pathway-audio-editor-footer">
            <small className="pathway-audio-editor-meta">{text.length.toLocaleString()} / {MAX_SCRIPT_CHARS.toLocaleString()} characters · Long-form audio auto-chunks{text.length > 0 && row.scriptModel ? ` · Draft model: ${row.scriptModel}` : ""}</small>
            <div className="pathway-audio-editor-actions">
              <button className="button button-small" type="button" disabled={busy || text.trim().length < 100} onClick={() => saveScript(row.slug)}>{running === `save:${row.slug}` ? "Saving…" : "Save draft"}</button>
              <button className="button button-small button-outline" type="button" disabled={busy || text.trim().length < 100} onClick={() => manuallyCheckScript(row.slug)}>{running === `check:${row.slug}` ? "Checking…" : row.checkerCurrent ? "Recheck script" : "Check script"}</button>
              <button className="button button-small" type="button" disabled={busy || text.trim().length < 100} onClick={() => approveScript(row.slug)}>{running === `approve:${row.slug}` ? "Checking + approving…" : approved ? "Re-approve script" : checkPassed ? "Approve script" : "Check & approve"}</button>
              <button className="button button-small" type="button" disabled={busy || !approved} onClick={() => generateAudio(row.slug, Boolean(row.audioUrl))}>{running === `audio:${row.slug}` ? "Generating audio…" : row.audioUrl ? "Regenerate audio" : "Generate audio"}</button>
              {row.audioUrl ? <a className="button button-small" href={row.audioUrl} target="_blank" rel="noreferrer">Preview audio</a> : null}
              {row.downloadUrl ? <a className="button button-small" href={row.downloadUrl}>Download WAV</a> : null}
              <button className="button button-small button-outline" type="button" disabled={busy} onClick={() => setOpenSlug(null)}>Close</button>
            </div>
          </div>
        </div>
      </section>;
    })() : null}

    <section className="admin-card pathway-audio-list-card">
      <div className="pathway-audio-desktop-table">
        <table className="admin-table">
          <thead><tr><th>Pathway</th><th>Script</th><th>Check</th><th>Audio</th><th>Starts</th><th>Listening</th><th>Completed</th><th /></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.slug}>
            <td><strong>{row.title}</strong><br/><small>{row.estimatedMinutes} min reading estimate</small></td>
            <td><strong>{scriptLabel(row)}</strong>{row.scriptText ? <><br/><small>{(drafts[row.slug] ?? row.scriptText).length.toLocaleString()} / {MAX_SCRIPT_CHARS.toLocaleString()} chars</small></> : null}</td>
            <td><strong>{checkerLabel(row)}</strong></td>
            <td><strong>{audioLabel(row)}</strong></td>
            <td>{row.starts}</td><td>{formatListeningTime(row.listenedSeconds)}</td><td>{row.completions}<br/><small>{completionRate(row)}</small></td>
            <td><div className="pathway-audio-row-actions"><button className="button button-small" type="button" disabled={Boolean(running)} onClick={() => row.scriptText ? revealEditor(row.slug) : generateScript(row.slug)}>{running === `script:${row.slug}` ? "Generating…" : row.scriptText ? "Open" : "Generate draft"}</button>{row.downloadUrl ? <a className="button button-small button-outline" href={row.downloadUrl}>WAV</a> : null}</div></td>
          </tr>)}</tbody>
        </table>
      </div>

      <div className="pathway-audio-mobile-list">
        {rows.map((row) => <article className="pathway-audio-mobile-card" key={row.slug}>
          <div className="pathway-audio-mobile-card-head">
            <div><h3>{row.title}</h3><small>{row.estimatedMinutes} min reading estimate</small></div>
          </div>
          <div className="pathway-audio-status-row">
            <span className={`pathway-audio-status ${scriptStatusClass(row)}`}>Script: {scriptLabel(row)}</span>
            <span className={`pathway-audio-status ${checkerStatusClass(row)}`}>Check: {checkerLabel(row)}</span>
            <span className={`pathway-audio-status ${audioStatusClass(row)}`}>Audio: {audioLabel(row)}</span>
          </div>
          <div className="pathway-audio-mobile-stats">
            <div><strong>{row.starts}</strong><span>Starts</span></div>
            <div><strong>{formatListeningTime(row.listenedSeconds)}</strong><span>Listening</span></div>
            <div><strong>{row.completions}</strong><span>Completed</span></div>
          </div>
          <div className="pathway-audio-mobile-actions">
            <button className="button" type="button" disabled={Boolean(running)} onClick={() => row.scriptText ? revealEditor(row.slug) : generateScript(row.slug)}>{running === `script:${row.slug}` ? "Generating draft…" : !row.scriptText ? "Generate draft" : row.scriptStatus === "approved" && row.sourceCurrent ? "Open approved script" : "Open script"}</button>
            {row.downloadUrl ? <a className="button button-outline" href={row.downloadUrl}>Download WAV</a> : null}
          </div>
        </article>)}
      </div>
    </section>
  </div>;
}
