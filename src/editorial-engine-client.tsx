"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { EditorialPack } from "./editorial-engine";
import styles from "./editorial-engine.module.css";

type PackRow = { production_date: string; project_id: string; payload: EditorialPack; sourceChanged: boolean; projectStatus: string };
type Snapshot = { enabled: boolean; timezone: string; packs: PackRow[] };
export function EditorialEngineClient({ canManage }: { canManage: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const [index, setIndex] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/editorial", { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load editorial production.");
    setSnapshot(data);
  }, []);
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, [load]);
  async function act(body: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/editorial", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Editorial production failed.");
      await load();
      setMessage(typeof data.inserted === "number" ? `${data.inserted} new daily drafts created. Existing edits preserved.` : data.enabled ? "Daily draft refill enabled." : "Daily draft refill paused.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Editorial production failed."); }
    finally { setBusy(false); }
  }
  const row = snapshot?.packs.find(p => p.project_id === selected) || snapshot?.packs[0];
  const pack = row?.payload;
  const frame = pack?.frames[index];
  return <div className={styles.page}>
    <header className="studio-page-heading"><span className="eyebrow">Publish · Content Engine</span><h1>A living Scripture series.</h1><p className="admin-lede">One pathway each week. Three teaching installments, two Scripture posters, one practical guide, and one invitation. A weekly newsletter brings readers back to the study.</p></header>
    <section className={`admin-card ${styles.controls}`}>
      <div><strong>{snapshot?.enabled ? "Daily draft production enabled" : "Daily draft production paused"}</strong><p>Refills a 14-day queue every morning. Dates are editorial targets; Publishing holds the actual approved schedule.</p></div>
      {canManage && <div className={styles.actions}><button className="button primary" disabled={busy || !snapshot} onClick={() => void act({ action: "prepare" })}>Prepare next 14 days</button><button className="button" disabled={busy || !snapshot} onClick={() => void act({ action: "configure", enabled: !snapshot?.enabled })}>{snapshot?.enabled ? "Pause refill" : "Enable daily refill"}</button></div>}
    </section>
    <p role="status" aria-live="polite">{busy ? "Preparing editorial drafts…" : message}</p>
    <div className={styles.workspace}>
      <section className={`admin-card ${styles.queue}`}><h2>Daily production queue</h2><p>Eastern time · {snapshot?.packs.length ?? 0} drafted days</p>
        {!snapshot?.packs.length && <p>Prepare the queue to create editable projects, captions, artwork previews, and newsletter drafts.</p>}
        {snapshot?.packs.map(item => <button type="button" key={item.project_id} className={row?.project_id === item.project_id ? styles.selected : ""} onClick={() => { setSelected(item.project_id); setIndex(0); }}><small>{item.production_date} · {item.payload.lane}</small><strong>{item.payload.title}</strong><span>{item.sourceChanged ? "Source changed: review again" : item.payload.blockers.length ? "Production blocked" : `Project: ${item.projectStatus}`}</span></button>)}
      </section>
      {row && pack && <section className={`admin-card ${styles.detail}`}><span className="eyebrow">{pack.series}</span><h2>{pack.title}</h2>
        <p>{pack.artDirection}</p>
        <div className={styles.gates}><strong>Review required</strong><p>Canonical source copied into the draft. Doctrine and visual approval are still required. PNG previews are review artwork, not proof of publishing readiness.</p>{row.sourceChanged && <p>Canonical source changed since generation. Reconcile this project before publishing.</p>}{pack.blockers.map(blocker => <p key={blocker}>{blocker}</p>)}</div>
        {frame && <><img className={styles.preview} src={`/api/admin/editorial/preview?project=${row.project_id}&frame=${index}`} alt={frame.altText}/><div className={styles.actions}><button type="button" className="button" disabled={index === 0} onClick={() => setIndex(i => i - 1)}>Previous</button><span>{index + 1} / {pack.frames.length}</span><button type="button" className="button" disabled={index >= pack.frames.length - 1} onClick={() => setIndex(i => i + 1)}>Next</button><a className="button" href={`/api/admin/editorial/preview?project=${row.project_id}&frame=${index}&download=1`}>Download PNG</a></div></>}
        <div className={styles.actions}><Link className="button primary" href={`/admin/carousel-studio?project=${row.project_id}`}>Review in Carousel Studio</Link><Link className="button" href="/admin/publishing">Open Publishing</Link><Link className="button" href={`/pathways/${pack.pathwaySlug}`}>Read source</Link></div>
        <details><summary>Generated caption</summary><p className={styles.copy}>{pack.caption}</p></details>
        {pack.newsletter && <details open><summary>Weekly newsletter draft</summary><h3>{pack.newsletter.subject}</h3><p className={styles.copy}>{pack.newsletter.summary}</p>{pack.newsletter.resources?.map(resource => <p key={resource.url}><a href={resource.url}>{resource.title}</a><br/>{resource.summary}</p>)}<div className={styles.actions}><a className="button" href={`/api/admin/editorial/preview?project=${row.project_id}&kind=newsletter`} target="_blank" rel="noreferrer">Preview email</a><a className="button" href={`/api/admin/editorial/preview?project=${row.project_id}&kind=newsletter&download=1`}>Download HTML</a><Link className="button" href={`/admin/broadcasts?editorial=${pack.date}`}>Open draft in Broadcasts</Link></div><p>Prepared draft. No recipients enrolled and no email sent.</p></details>}
      </section>}
    </div>
  </div>;
}
