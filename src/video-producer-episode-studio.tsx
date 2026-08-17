"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, Loader2, MessageCircleMore, Plus, Save, Send, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { VideoProducerSectionNav } from "@/video-producer-section-nav";
import { EPISODE_FORMATS, episodeFormatLabel, type EpisodeFormat, type EpisodeReview, type EpisodeSpeaker } from "@/video-producer-episode-script";

type Pathway = { slug: string; title: string; summary: string; collection: string; steps: Array<{ title: string; reference: string; explanation: string }> };
type Episode = {
  id: string;
  title: string;
  premise: string;
  primary_pathway_slug: string;
  supporting_pathway_slugs: string[];
  format: EpisodeFormat;
  speakers: EpisodeSpeaker[];
  script_text: string;
  theology_review: (EpisodeReview & { model?: string; checkedAt?: string }) | null;
  status: "draft" | "needs_review" | "approved" | "exported";
  exported_project_id: string | null;
  updated_at: string;
};

type LoadData = { episodes: Episode[]; pathways: Pathway[]; error?: string };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function speakersFor(format: EpisodeFormat): EpisodeSpeaker[] {
  if (format === "dialogue") return [{ name: "Cedar", role: "host" }, { name: "Guest", role: "co-host / conversation partner" }];
  if (format === "panel") return [{ name: "Cedar", role: "host" }, { name: "Guest 1", role: "conversation partner" }, { name: "Guest 2", role: "conversation partner" }];
  return [{ name: "Cedar", role: "host" }];
}

function statusLabel(status: Episode["status"]) {
  if (status === "needs_review") return "Needs review";
  if (status === "approved") return "Approved";
  if (status === "exported") return "In Video Producer";
  return "Draft";
}

export function VideoProducerEpisodeStudio() {
  const router = useRouter();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPremise, setNewPremise] = useState("");
  const [newPrimary, setNewPrimary] = useState("");
  const [newSupport, setNewSupport] = useState<string[]>([]);
  const [newFormat, setNewFormat] = useState<EpisodeFormat>("solo");
  const [newSpeakers, setNewSpeakers] = useState<EpisodeSpeaker[]>(speakersFor("solo"));
  const [draft, setDraft] = useState<Episode | null>(null);
  const [dirty, setDirty] = useState(false);
  const editCounter = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json<LoadData>("/api/admin/video-producer/episodes");
      setEpisodes(data.episodes ?? []);
      setPathways(data.pathways ?? []);
      setNewPrimary((current) => current || data.pathways?.[0]?.slug || "");
      setError("");
      if (!activeId && data.episodes?.[0]) setActiveId(data.episodes[0].id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Episodes could not be loaded.");
    } finally { setLoading(false); }
  }, [activeId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const episode = episodes.find((item) => item.id === activeId) ?? null;
    setDraft(episode ? structuredClone(episode) : null);
    setDirty(false);
    editCounter.current = 0;
  }, [activeId, episodes]);

  const primaryPathway = useMemo(() => draft ? pathways.find((pathway) => pathway.slug === draft.primary_pathway_slug) ?? null : null, [draft, pathways]);

  function mutate(patch: Partial<Episode>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
    editCounter.current += 1;
  }

  async function save() {
    if (!draft || !dirty) return draft;
    const counter = editCounter.current;
    setBusy("save"); setError("");
    try {
      const data = await json<{ episode: Episode }>(`/api/admin/video-producer/episodes/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          premise: draft.premise,
          primaryPathwaySlug: draft.primary_pathway_slug,
          supportingPathwaySlugs: draft.supporting_pathway_slugs,
          format: draft.format,
          speakers: draft.speakers,
          scriptText: draft.script_text
        })
      });
      setEpisodes((current) => current.map((item) => item.id === data.episode.id ? data.episode : item));
      if (counter === editCounter.current) { setDraft(data.episode); setDirty(false); }
      setMessage("Episode saved.");
      return data.episode;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Episode could not be saved.");
      return null;
    } finally { setBusy(""); }
  }

  useEffect(() => {
    if (!dirty || !draft || busy) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createEpisode() {
    if (!newTitle.trim() || !newPremise.trim() || !newPrimary) return;
    setBusy("create"); setError("");
    try {
      const data = await json<{ episode: Episode }>("/api/admin/video-producer/episodes", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, premise: newPremise, primaryPathwaySlug: newPrimary, supportingPathwaySlugs: newSupport, format: newFormat, speakers: newSpeakers })
      });
      setEpisodes((current) => [data.episode, ...current]);
      setActiveId(data.episode.id);
      setNewOpen(false); setNewTitle(""); setNewPremise(""); setNewSupport([]); setNewFormat("solo"); setNewSpeakers(speakersFor("solo"));
      setMessage("Episode project created. Generate the script when the premise is right.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode could not be created."); }
    finally { setBusy(""); }
  }

  async function generate() {
    if (!draft) return;
    if (dirty) await save();
    setBusy("generate"); setMessage("Writing from the selected Pathways and premise…"); setError("");
    try {
      const data = await json<{ episode: Episode }>(`/api/admin/video-producer/episodes/${draft.id}/generate`, { method: "POST" });
      setEpisodes((current) => current.map((item) => item.id === data.episode.id ? data.episode : item));
      setDraft(data.episode); setDirty(false); setMessage("Episode generated. Edit freely, then run Theology Check.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode generation failed."); }
    finally { setBusy(""); }
  }

  async function review(approve = false) {
    if (!draft) return;
    if (dirty) await save();
    setBusy(approve ? "approve" : "review"); setMessage(approve ? "Rechecking before approval…" : "Checking theology, Scripture, source, conversation, and application…"); setError("");
    try {
      const data = await json<{ episode: Episode; review: EpisodeReview }>(`/api/admin/video-producer/episodes/${draft.id}/review`, { method: "POST", body: JSON.stringify({ approve }) });
      setEpisodes((current) => current.map((item) => item.id === data.episode.id ? data.episode : item));
      setDraft(data.episode); setDirty(false); setMessage(approve ? "Episode approved for production." : data.review.verdict === "passed" ? "Theology check passed. Approve when the script is final." : "Review found items that need attention.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode review failed."); }
    finally { setBusy(""); }
  }

  async function exportToProducer() {
    if (!draft) return;
    setBusy("export"); setError("");
    try {
      const data = await json<{ projectId: string }>(`/api/admin/video-producer/episodes/${draft.id}/export`, { method: "POST" });
      router.push(`/admin/video-producer/${data.projectId}/source`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode could not be sent to Video Producer."); setBusy(""); }
  }

  async function removeEpisode() {
    if (!draft || !window.confirm(`Delete “${draft.title}” permanently?`)) return;
    setBusy("delete");
    try {
      await json(`/api/admin/video-producer/episodes/${draft.id}`, { method: "DELETE" });
      const next = episodes.filter((item) => item.id !== draft.id);
      setEpisodes(next); setActiveId(next[0]?.id ?? null); setMessage("Episode deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode could not be deleted."); }
    finally { setBusy(""); }
  }

  function setFormat(format: EpisodeFormat) {
    if (!draft) return;
    mutate({ format, speakers: speakersFor(format) });
  }

  function updateSpeaker(index: number, patch: Partial<EpisodeSpeaker>) {
    if (!draft) return;
    mutate({ speakers: draft.speakers.map((speaker, speakerIndex) => speakerIndex === index ? { ...speaker, ...patch } : speaker) });
  }

  function toggleSupport(slug: string) {
    if (!draft) return;
    const has = draft.supporting_pathway_slugs.includes(slug);
    mutate({ supporting_pathway_slugs: has ? draft.supporting_pathway_slugs.filter((item) => item !== slug) : [...draft.supporting_pathway_slugs, slug].slice(0, 5) });
  }

  return <main className="episode-studio-page">
    <div className="episode-studio-shell">
      <header className="episode-studio-hero"><div><span>Apostolic Guide Media</span><h1>Episode Scripts</h1><p>Turn a thought into a Pathway-grounded solo episode, two-person conversation, or panel before anyone records a minute.</p></div><button className="button primary" onClick={() => setNewOpen((value) => !value)}><Plus size={14}/> New episode</button></header>
      <VideoProducerSectionNav active="episodes"/>
      {newOpen ? <section className="episode-new-card">
        <div className="episode-section-head"><div><span>Premise</span><h2>What do you want to talk about?</h2></div></div>
        <div className="episode-form-grid">
          <label>Episode title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Living Apostolic in a non-Apostolic world"/></label>
          <label>Primary Pathway<select value={newPrimary} onChange={(event) => setNewPrimary(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
          <label className="span-2">Your thought / premise<textarea rows={5} value={newPremise} onChange={(event) => setNewPremise(event.target.value)} placeholder="Write the thought exactly how it is in your head. Sol will shape it into an episode without replacing the Pathway as the theological source."/></label>
          <label>Format<select value={newFormat} onChange={(event) => { const value = event.target.value as EpisodeFormat; setNewFormat(value); setNewSpeakers(speakersFor(value)); }}>{EPISODE_FORMATS.map((format) => <option key={format} value={format}>{episodeFormatLabel(format)}</option>)}</select></label>
          <label>Supporting Pathway<select value="" onChange={(event) => { const value = event.target.value; if (value && !newSupport.includes(value)) setNewSupport((current) => [...current, value].slice(0, 5)); }}><option value="">Optional…</option>{pathways.filter((pathway) => pathway.slug !== newPrimary && !newSupport.includes(pathway.slug)).map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select><small>{newSupport.map((slug) => pathways.find((pathway) => pathway.slug === slug)?.title).filter(Boolean).join(" · ") || "Add another Pathway only when it actually serves the episode."}</small></label>
        </div>
        <div className="episode-speakers"><strong><Users size={15}/> Speakers</strong>{newSpeakers.map((speaker, index) => <div key={index}><input value={speaker.name} onChange={(event) => setNewSpeakers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/><input value={speaker.role} onChange={(event) => setNewSpeakers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item))}/></div>)}</div>
        <button className="button primary" disabled={busy === "create" || !newTitle.trim() || !newPremise.trim() || !newPrimary} onClick={() => void createEpisode()}>{busy === "create" ? <Loader2 size={14} className="spin"/> : <FileText size={14}/>} Create episode project</button>
      </section> : null}

      {error ? <div className="admin-notice episode-error">{error}</div> : null}
      {message ? <p className="episode-status">{message}</p> : null}

      <div className="episode-workspace">
        <aside className="episode-library"><div className="episode-library-head"><strong>Episodes</strong><span>{episodes.length}</span></div>{loading ? <div className="episode-empty"><Loader2 className="spin" size={16}/> Loading…</div> : episodes.length ? episodes.map((episode) => <button key={episode.id} className={episode.id === activeId ? "is-active" : ""} onClick={() => setActiveId(episode.id)}><strong>{episode.title}</strong><span>{episodeFormatLabel(episode.format)} · {statusLabel(episode.status)}</span></button>) : <div className="episode-empty">No episode scripts yet.</div>}</aside>
        <section className="episode-editor">
          {draft ? <>
            <div className="episode-editor-top"><div><span>{statusLabel(draft.status)}</span><input value={draft.title} onChange={(event) => mutate({ title: event.target.value })}/><small>{primaryPathway?.title || draft.primary_pathway_slug}</small></div><div><button className="button small" disabled={!dirty || Boolean(busy)} onClick={() => void save()}><Save size={13}/> Save</button><button className="button small danger" disabled={Boolean(busy)} onClick={() => void removeEpisode()}><Trash2 size={13}/></button></div></div>
            <div className="episode-tabs-context">
              <label>Primary Pathway<select value={draft.primary_pathway_slug} onChange={(event) => mutate({ primary_pathway_slug: event.target.value, supporting_pathway_slugs: draft.supporting_pathway_slugs.filter((slug) => slug !== event.target.value) })}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
              <label>Format<select value={draft.format} onChange={(event) => setFormat(event.target.value as EpisodeFormat)}>{EPISODE_FORMATS.map((format) => <option key={format} value={format}>{episodeFormatLabel(format)}</option>)}</select></label>
            </div>
            <label className="episode-premise">Thought / premise<textarea rows={5} value={draft.premise} onChange={(event) => mutate({ premise: event.target.value })}/></label>
            <details className="episode-supporting"><summary>Supporting Pathways · {draft.supporting_pathway_slugs.length}</summary><div>{pathways.filter((pathway) => pathway.slug !== draft.primary_pathway_slug).map((pathway) => <label key={pathway.slug}><input type="checkbox" checked={draft.supporting_pathway_slugs.includes(pathway.slug)} onChange={() => toggleSupport(pathway.slug)}/><span>{pathway.title}</span></label>)}</div></details>
            <div className="episode-speakers"><strong><MessageCircleMore size={15}/> Voices</strong>{draft.speakers.map((speaker, index) => <div key={index}><input value={speaker.name} onChange={(event) => updateSpeaker(index, { name: event.target.value })}/><input value={speaker.role} onChange={(event) => updateSpeaker(index, { role: event.target.value })}/></div>)}</div>
            <div className="episode-generate-row"><button className="button primary" disabled={Boolean(busy) || !draft.premise.trim()} onClick={() => void generate()}>{busy === "generate" ? <Loader2 className="spin" size={14}/> : <Sparkles size={14}/>} {draft.script_text ? "Regenerate script" : "Generate script"}</button><small>Pathways control theology. Your premise controls the practical question and emphasis.</small></div>
            <label className="episode-script">Episode script<textarea rows={24} value={draft.script_text} onChange={(event) => mutate({ script_text: event.target.value })} placeholder="Generate a script or write it manually here."/></label>
            {draft.theology_review ? <section className={`episode-review-card is-${draft.theology_review.verdict}`}><div><ShieldCheck size={17}/><strong>{draft.theology_review.verdict === "passed" ? "Theology check passed" : "Review required"}</strong></div><p>{draft.theology_review.summary}</p><div className="episode-review-checks">{draft.theology_review.checks.map((check) => <span key={check.id} data-state={check.status}><b>{check.id.replaceAll("_", " ")}</b>{check.message}</span>)}</div>{draft.theology_review.issues.length ? <details><summary>{draft.theology_review.issues.length} issue(s)</summary>{draft.theology_review.issues.map((issue, index) => <article key={index}><strong>{issue.category}</strong>{issue.quote ? <blockquote>{issue.quote}</blockquote> : null}<p>{issue.message}</p>{issue.suggestion ? <small>{issue.suggestion}</small> : null}</article>)}</details> : null}</section> : null}
            <div className="episode-final-actions"><button className="button" disabled={Boolean(busy) || !draft.script_text.trim()} onClick={() => void review(false)}>{busy === "review" ? <Loader2 className="spin" size={14}/> : <ShieldCheck size={14}/>} Theology Check</button><button className="button" disabled={Boolean(busy) || draft.theology_review?.verdict !== "passed" || draft.status === "approved" || draft.status === "exported"} onClick={() => void review(true)}>{busy === "approve" ? <Loader2 className="spin" size={14}/> : <Check size={14}/>} Approve episode</button><button className="button primary" disabled={Boolean(busy) || !["approved", "exported"].includes(draft.status)} onClick={() => void exportToProducer()}>{busy === "export" ? <Loader2 className="spin" size={14}/> : <Send size={14}/>} {draft.status === "exported" ? "Open in Video Producer" : "Send to Video Producer"}</button></div>
          </> : <div className="episode-editor-empty"><FileText size={28}/><strong>Select an episode or create one.</strong><span>The script, Pathways, speakers, review, and handoff persist together.</span></div>}
        </section>
      </div>
    </div>
  </main>;
}
