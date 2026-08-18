"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, FileText, Film, Headphones, Loader2, Plus, Save, Send, ShieldCheck, Sparkles, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { EPISODE_FORMATS, episodeFormatLabel, type EpisodeFormat, type EpisodeReview, type EpisodeSpeaker } from "@/video-producer-episode-script";

type Stage = "script" | "audio" | "video" | "publish";
type Pathway = { slug: string; title: string; summary: string };
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
  audio_url: string | null;
  audio_storage_path: string | null;
  audio_content_hash: string | null;
  audio_model: string | null;
  audio_voice_map: Record<string, string> | null;
  audio_generated_at: string | null;
  updated_at: string;
};

type LoadData = { episodes: Episode[]; pathways: Pathway[] };

const STAGES: Array<{ id: Stage; label: string; icon: typeof FileText }> = [
  { id: "script", label: "Script", icon: FileText },
  { id: "audio", label: "Audio", icon: Headphones },
  { id: "video", label: "Video", icon: Film },
  { id: "publish", label: "Publish", icon: Send }
];

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function speakersFor(format: EpisodeFormat): EpisodeSpeaker[] {
  if (format === "dialogue") return [{ name: "Cedar", role: "host" }, { name: "Guest", role: "conversation partner" }];
  if (format === "panel") return [{ name: "Cedar", role: "host" }, { name: "Guest 1", role: "conversation partner" }, { name: "Guest 2", role: "conversation partner" }];
  return [{ name: "Cedar", role: "host" }];
}

function statusLabel(episode: Episode) {
  if (episode.exported_project_id) return "Video project created";
  if (episode.audio_url) return "Audio ready";
  if (episode.status === "approved") return "Script approved";
  if (episode.status === "needs_review") return "Needs review";
  return "Draft";
}

export function EpisodeStudioLane() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("script");
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Episode | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPremise, setNewPremise] = useState("");
  const [newPrimary, setNewPrimary] = useState("");
  const [newFormat, setNewFormat] = useState<EpisodeFormat>("solo");
  const [newSpeakers, setNewSpeakers] = useState<EpisodeSpeaker[]>(speakersFor("solo"));
  const editCounter = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await json<LoadData>("/api/admin/video-producer/episodes");
      setEpisodes(data.episodes ?? []);
      setPathways(data.pathways ?? []);
      setNewPrimary((current) => current || data.pathways?.[0]?.slug || "");
      setActiveId((current) => current || data.episodes?.[0]?.id || null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Episodes could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const selected = episodes.find((episode) => episode.id === activeId) ?? null;
    setDraft(selected ? structuredClone(selected) : null);
    setDirty(false);
    editCounter.current = 0;
  }, [activeId, episodes]);

  const primaryPathway = useMemo(() => draft ? pathways.find((pathway) => pathway.slug === draft.primary_pathway_slug) ?? null : null, [draft, pathways]);
  const scriptReady = Boolean(draft && ["approved", "exported"].includes(draft.status) && draft.theology_review?.verdict === "passed");
  const audioReady = Boolean(draft?.audio_url);
  const videoReady = Boolean(draft?.exported_project_id);

  function mutate(patch: Partial<Episode>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setDirty(true);
    editCounter.current += 1;
  }

  function syncEpisode(episode: Episode) {
    setEpisodes((current) => current.map((item) => item.id === episode.id ? episode : item));
    setDraft(episode);
    setDirty(false);
  }

  async function save() {
    if (!draft || !dirty) return draft;
    const counter = editCounter.current;
    setBusy("save"); setError("");
    try {
      const data = await json<{ episode: Episode }>(`/api/admin/video-producer/episodes/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: draft.title, premise: draft.premise, primaryPathwaySlug: draft.primary_pathway_slug, supportingPathwaySlugs: draft.supporting_pathway_slugs, format: draft.format, speakers: draft.speakers, scriptText: draft.script_text })
      });
      setEpisodes((current) => current.map((item) => item.id === data.episode.id ? data.episode : item));
      if (counter === editCounter.current) { setDraft(data.episode); setDirty(false); }
      return data.episode;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Episode could not be saved.");
      return null;
    } finally { setBusy(""); }
  }

  useEffect(() => {
    if (!dirty || !draft || busy) return;
    const timer = window.setTimeout(() => void save(), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createEpisode() {
    if (!newTitle.trim() || !newPremise.trim() || !newPrimary) return;
    setBusy("create"); setError("");
    try {
      const data = await json<{ episode: Episode }>("/api/admin/video-producer/episodes", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, premise: newPremise, primaryPathwaySlug: newPrimary, supportingPathwaySlugs: [], format: newFormat, speakers: newSpeakers })
      });
      setEpisodes((current) => [data.episode, ...current]);
      setActiveId(data.episode.id);
      setNewOpen(false); setNewTitle(""); setNewPremise(""); setNewFormat("solo"); setNewSpeakers(speakersFor("solo"));
      setStage("script");
      setMessage("Episode created. Shape the script, then move through Audio, Video, and Publish.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode could not be created."); }
    finally { setBusy(""); }
  }

  async function generate() {
    if (!draft) return;
    if (dirty) await save();
    setBusy("generate"); setError(""); setMessage("Writing from your premise and selected Pathways…");
    try {
      const data = await json<{ episode: Episode }>(`/api/admin/video-producer/episodes/${draft.id}/generate`, { method: "POST" });
      syncEpisode(data.episode);
      setMessage("Script generated. Edit it freely, then run Theology Check.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode generation failed."); }
    finally { setBusy(""); }
  }

  async function review(approve = false) {
    if (!draft) return;
    if (dirty) await save();
    setBusy(approve ? "approve" : "review"); setError("");
    try {
      const data = await json<{ episode: Episode; review: EpisodeReview }>(`/api/admin/video-producer/episodes/${draft.id}/review`, { method: "POST", body: JSON.stringify({ approve }) });
      syncEpisode(data.episode);
      setMessage(approve ? "Script approved. Audio is unlocked." : data.review.verdict === "passed" ? "Theology check passed." : "Review found items to fix before approval.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode review failed."); }
    finally { setBusy(""); }
  }

  async function generateAudio() {
    if (!draft) return;
    setBusy("audio"); setError(""); setMessage("Rendering and mastering episode audio…");
    try {
      const data = await json<{ episode: Episode }>(`/api/admin/episode-studio/${draft.id}/audio`, { method: "POST" });
      syncEpisode(data.episode);
      setMessage("Episode audio is ready. Continue to Video when it sounds right.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Episode audio generation failed."); }
    finally { setBusy(""); }
  }

  async function createVideoProject() {
    if (!draft) return;
    setBusy("video"); setError("");
    try {
      const data = await json<{ projectId: string }>(`/api/admin/video-producer/episodes/${draft.id}/export`, { method: "POST" });
      const next = { ...draft, exported_project_id: data.projectId, status: "exported" as const };
      syncEpisode(next);
      setMessage("Video production project created. The episode context stays attached to it.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Video project could not be created."); }
    finally { setBusy(""); }
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

  function selectStage(next: Stage) {
    setStage(next);
    window.setTimeout(() => document.getElementById("episode-stage-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 20);
  }

  return <main className="episode-lane-page">
    <div className="episode-lane-shell">
      <header className="episode-lane-hero">
        <div><span>Apostolic Guide Media</span><h1>Episode Studio</h1><p>One episode, one clear path. Start with the thought, lock the theology, make the audio, build the video, then publish.</p></div>
        <button className="button primary" onClick={() => { setNewOpen((value) => !value); setStage("script"); }}><Plus size={15}/> New episode</button>
      </header>

      <nav className="episode-lane-steps" aria-label="Episode workflow">
        {STAGES.map((item, index) => {
          const Icon = item.icon;
          const complete = item.id === "script" ? scriptReady : item.id === "audio" ? audioReady : item.id === "video" ? videoReady : false;
          return <button key={item.id} type="button" data-active={stage === item.id} data-complete={complete} onClick={() => selectStage(item.id)}><span>{complete ? <Check size={13}/> : index + 1}</span><Icon size={15}/><strong>{item.label}</strong></button>;
        })}
      </nav>

      {newOpen ? <section className="episode-lane-new">
        <div><span>New episode</span><h2>What do you want to talk about?</h2></div>
        <div className="episode-lane-new-grid">
          <label>Title<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Living Apostolic in a non-Apostolic world"/></label>
          <label>Primary Pathway<select value={newPrimary} onChange={(event) => setNewPrimary(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
          <label className="wide">Your thought<textarea rows={5} value={newPremise} onChange={(event) => setNewPremise(event.target.value)} placeholder="Write the thought exactly how it is in your head. This controls the practical question while the Pathway controls theology."/></label>
          <label>Format<select value={newFormat} onChange={(event) => { const format = event.target.value as EpisodeFormat; setNewFormat(format); setNewSpeakers(speakersFor(format)); }}>{EPISODE_FORMATS.map((format) => <option value={format} key={format}>{episodeFormatLabel(format)}</option>)}</select></label>
          <div className="episode-lane-new-speakers"><strong><Users size={14}/> Voices</strong>{newSpeakers.map((speaker, index) => <input key={index} value={speaker.name} onChange={(event) => setNewSpeakers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}/>)}</div>
        </div>
        <button className="button primary" disabled={!newTitle.trim() || !newPremise.trim() || busy === "create"} onClick={() => void createEpisode()}>{busy === "create" ? <Loader2 className="spin" size={14}/> : <ArrowRight size={14}/>} Create and start script</button>
      </section> : null}

      {error ? <div className="admin-notice episode-error">{error}</div> : null}
      {message ? <div className="episode-lane-message">{message}</div> : null}

      <div className="episode-lane-workspace">
        <aside className="episode-lane-library">
          <div className="episode-lane-library-head"><strong>Episodes</strong><span>{episodes.length}</span></div>
          {loading ? <div className="episode-lane-empty"><Loader2 size={15} className="spin"/> Loading…</div> : episodes.length ? episodes.map((episode) => <button type="button" data-active={episode.id === activeId} key={episode.id} onClick={() => setActiveId(episode.id)}><strong>{episode.title}</strong><span>{episodeFormatLabel(episode.format)} · {statusLabel(episode)}</span></button>) : <div className="episode-lane-empty">Create the first episode above.</div>}
        </aside>

        <section id="episode-stage-panel" className="episode-lane-panel">
          {!draft ? <div className="episode-lane-zero"><FileText size={28}/><strong>No episode selected</strong><p>Create an episode and its whole production path will live here.</p></div> : <>
            <div className="episode-lane-context"><div><span>{primaryPathway?.title || draft.primary_pathway_slug}</span><h2>{draft.title}</h2><p>{episodeFormatLabel(draft.format)} · {statusLabel(draft)}</p></div><div><button className="button small" disabled={!dirty || Boolean(busy)} onClick={() => void save()}><Save size={13}/> Save</button><button className="button small danger" disabled={Boolean(busy)} onClick={() => void removeEpisode()}><Trash2 size={13}/></button></div></div>

            {stage === "script" ? <div className="episode-lane-stage">
              <div className="episode-lane-stage-head"><span>01 · Script</span><h3>Turn the thought into the episode.</h3><p>Pathways govern the doctrine. Your premise, format, and voices govern the actual conversation.</p></div>
              <div className="episode-lane-form-grid">
                <label>Primary Pathway<select value={draft.primary_pathway_slug} onChange={(event) => mutate({ primary_pathway_slug: event.target.value })}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
                <label>Format<select value={draft.format} onChange={(event) => { const format = event.target.value as EpisodeFormat; mutate({ format, speakers: speakersFor(format) }); }}>{EPISODE_FORMATS.map((format) => <option value={format} key={format}>{episodeFormatLabel(format)}</option>)}</select></label>
                <label className="wide">Thought / premise<textarea rows={4} value={draft.premise} onChange={(event) => mutate({ premise: event.target.value })}/></label>
              </div>
              <div className="episode-lane-voices"><strong><Users size={14}/> Speakers</strong>{draft.speakers.map((speaker, index) => <div key={index}><input value={speaker.name} onChange={(event) => mutate({ speakers: draft.speakers.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item) })}/><input value={speaker.role} onChange={(event) => mutate({ speakers: draft.speakers.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item) })}/></div>)}</div>
              <button className="button primary" disabled={Boolean(busy) || !draft.premise.trim()} onClick={() => void generate()}>{busy === "generate" ? <Loader2 className="spin" size={14}/> : <Sparkles size={14}/>} {draft.script_text ? "Regenerate script" : "Generate script"}</button>
              <label className="episode-lane-script">Episode script<textarea rows={24} value={draft.script_text} onChange={(event) => mutate({ script_text: event.target.value })} placeholder="Generate the script or write it manually here."/></label>
              {draft.theology_review ? <div className="episode-lane-review" data-verdict={draft.theology_review.verdict}><div><ShieldCheck size={17}/><strong>{draft.theology_review.verdict === "passed" ? "Theology check passed" : "Review required"}</strong></div><p>{draft.theology_review.summary}</p>{draft.theology_review.issues?.length ? <small>{draft.theology_review.issues.length} item(s) still need attention.</small> : null}</div> : null}
              <div className="episode-lane-actions"><button className="button" disabled={Boolean(busy) || !draft.script_text.trim()} onClick={() => void review(false)}><ShieldCheck size={14}/> Theology Check</button><button className="button" disabled={Boolean(busy) || draft.theology_review?.verdict !== "passed" || scriptReady} onClick={() => void review(true)}><Check size={14}/> Approve script</button><button className="button primary" disabled={!scriptReady} onClick={() => selectStage("audio")}>Continue to Audio <ArrowRight size={14}/></button></div>
            </div> : null}

            {stage === "audio" ? <div className="episode-lane-stage">
              <div className="episode-lane-stage-head"><span>02 · Audio</span><h3>Make the approved script audible.</h3><p>Episode audio uses the same lossless mastering path as Pathway narration. Multi-speaker scripts render each named turn with its assigned voice.</p></div>
              {!scriptReady ? <div className="episode-lane-blocked"><ShieldCheck size={22}/><strong>Approve the script first.</strong><p>Audio stays locked until the current wording passes theology review and is approved.</p><button className="button" onClick={() => selectStage("script")}>Back to Script</button></div> : <>
                <div className="episode-lane-audio-card">
                  <div><Headphones size={22}/><div><strong>{audioReady ? "Master audio ready" : "Ready to generate"}</strong><span>{draft.audio_generated_at ? new Date(draft.audio_generated_at).toLocaleString() : `${draft.speakers.length} voice${draft.speakers.length === 1 ? "" : "s"} · mastered WAV`}</span></div></div>
                  {draft.audio_url ? <audio controls preload="metadata" src={draft.audio_url}/> : null}
                  {draft.audio_voice_map ? <div className="episode-lane-voice-map">{Object.entries(draft.audio_voice_map).map(([speaker, voice]) => <span key={speaker}><b>{speaker}</b>{voice}</span>)}</div> : null}
                </div>
                <div className="episode-lane-actions"><button className="button primary" disabled={busy === "audio"} onClick={() => void generateAudio()}>{busy === "audio" ? <Loader2 className="spin" size={14}/> : <Headphones size={14}/>} {audioReady ? "Regenerate audio" : "Generate audio"}</button><button className="button" disabled={!audioReady} onClick={() => selectStage("video")}>Continue to Video <ArrowRight size={14}/></button></div>
              </>}
            </div> : null}

            {stage === "video" ? <div className="episode-lane-stage">
              <div className="episode-lane-stage-head"><span>03 · Video</span><h3>Build the YouTube production package.</h3><p>The episode stays in this lane, while the existing Video Producer engine handles the heavy media work behind it.</p></div>
              {!audioReady ? <div className="episode-lane-blocked"><Headphones size={22}/><strong>Finish the audio first.</strong><p>The approved master audio is the source of truth for episode video production.</p><button className="button" onClick={() => selectStage("audio")}>Back to Audio</button></div> : <div className="episode-lane-video-card"><Film size={28}/><div><strong>{videoReady ? "Video production project connected" : "Ready for video production"}</strong><p>{videoReady ? "Your script, Pathways, speakers, theology review, and episode metadata are attached to the video project." : "Create the production project. The existing project editor remains unchanged."}</p></div><div>{videoReady ? <button className="button primary" onClick={() => router.push(`/admin/video-producer/${draft.exported_project_id}/source`)}>Open video project</button> : <button className="button primary" disabled={busy === "video"} onClick={() => void createVideoProject()}>{busy === "video" ? <Loader2 className="spin" size={14}/> : <Film size={14}/>} Create video project</button>}<button className="button" disabled={!videoReady} onClick={() => selectStage("publish")}>Continue to Publish <ArrowRight size={14}/></button></div></div>}
            </div> : null}

            {stage === "publish" ? <div className="episode-lane-stage">
              <div className="episode-lane-stage-head"><span>04 · Publish</span><h3>Review the episode package, then hand it to Publishing.</h3><p>This is the dedicated Episode publishing checkpoint. Nothing posts automatically.</p></div>
              <div className="episode-lane-publish-card">
                <div className="episode-lane-publish-summary"><span>Episode</span><strong>{draft.title}</strong><small>{primaryPathway?.title || draft.primary_pathway_slug} · {episodeFormatLabel(draft.format)}</small></div>
                <div className="episode-lane-publish-checks"><span data-ready={scriptReady}><Check size={13}/> Script approved</span><span data-ready={audioReady}><Check size={13}/> Audio ready</span><span data-ready={videoReady}><Check size={13}/> Video project connected</span></div>
                <button className="button primary" disabled={!videoReady} onClick={() => router.push(`/admin/publishing?view=video&episode=${encodeURIComponent(draft.id)}&pathway=${encodeURIComponent(draft.primary_pathway_slug)}`)}><Send size={15}/> Open in Publishing</button>
                {!videoReady ? <p>Finish Video before the final publishing handoff unlocks.</p> : <p>Publishing receives the Episode context and primary Pathway so final channel metadata stays attached.</p>}
              </div>
            </div> : null}
          </>}
        </section>
      </div>
    </div>
  </main>;
}
