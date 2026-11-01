"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, BookOpen, BrainCircuit, ListVideo, MessageSquareText, Plus, Radio, Route, Sparkles, Users, Vote } from "lucide-react";

type StudioPathway = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  estimatedMinutes: number;
  level: string;
  steps: Array<{ title: string; reference: string; explanation: string }>;
};
type StudioEpisode = { id: string; title: string; type: string; status: string; updatedAt: string };
type Cue = { id: string; label: string; detail: string };

const initialCues: Cue[] = [
  { id: "intro", label: "AG Intro", detail: "Media fullscreen then host" },
  { id: "host-open", label: "Host Open", detail: "Host fullscreen" },
  { id: "title", label: "Episode Title", detail: "Title overlay" },
  { id: "cta", label: "Pathway CTA", detail: "Linked pathway and QR" },
  { id: "outro", label: "AG Outro", detail: "Media fullscreen" }
];

export default function StudioClient({ pathways, episodes }: { pathways: StudioPathway[]; episodes: StudioEpisode[] }) {
  const [selectedPathway, setSelectedPathway] = useState(pathways.find((item) => item.slug === "jesus-is-god") ?? pathways[0]);
  const [cues, setCues] = useState<Cue[]>(initialCues);
  const [activeTab, setActiveTab] = useState<"plan" | "intelligence" | "audience">("plan");
  const coverage = useMemo(() => selectedPathway?.steps.map((step, index) => ({ ...step, state: index < 2 ? "covered" : index === 2 ? "partial" : "gap" })) ?? [], [selectedPathway]);
  const activeCount = episodes.filter((episode) => !["archived", "published"].includes(episode.status)).length;

  function addScripture(step: StudioPathway["steps"][number]) {
    const id = `${selectedPathway.slug}:${step.reference}`;
    if (cues.some((cue) => cue.id === id)) return;
    const next = [...cues];
    const target = Math.max(next.findIndex((cue) => cue.id === "cta"), 0);
    next.splice(target, 0, { id, label: step.reference, detail: step.title });
    setCues(next);
  }

  return (
    <main className="ag-studio">
      <header className="ag-studio-topbar">
        <div className="ag-studio-brand"><span className="ag-studio-mark">AG</span><div><strong>Broadcast Studio</strong><span>Production control</span></div></div>
        <span className="ag-studio-status">SYSTEM READY</span>
      </header>

      <section className="ag-studio-hero">
        <div><span className="ag-studio-eyebrow">Apostolic Guide Live Production</span><h1>Build. Produce. Go live.</h1><p>Turn real AG pathways into episodes, run the show, bring in guests, moderate the audience, control scenes, and send a clean program feed to OBS.</p></div>
        <Link className="ag-studio-primary" href="/studio/episodes/new"><Plus size={17}/> New episode</Link>
      </section>

      <section className="ag-studio-dashboard-strip" aria-label="Studio status">
        <div className="ag-studio-stat"><span>Episodes</span><strong>{episodes.length}</strong></div>
        <div className="ag-studio-stat"><span>Active work</span><strong>{activeCount}</strong></div>
        <div className="ag-studio-stat"><span>Pathways available</span><strong>{pathways.length}</strong></div>
        <div className="ag-studio-stat"><span>Production mode</span><strong>LIVE</strong></div>
      </section>

      {episodes.length > 0 && <section className="ag-studio-recent"><div className="ag-studio-section-head"><h2>Recent episodes</h2><Link href="/studio/episodes/new">Create another</Link></div><div className="ag-studio-recent-grid">{episodes.slice(0,6).map((episode)=><Link className="ag-studio-episode-card" href={`/studio/episodes/${episode.id}`} key={episode.id}><span>{episode.type} • {episode.status}</span><strong>{episode.title}</strong><small>{episode.updatedAt ? `Updated ${new Date(episode.updatedAt).toLocaleDateString()}` : "Ready to continue"}</small></Link>)}</div></section>}

      <nav className="ag-studio-tabs">
        <button className={activeTab === "plan" ? "active" : ""} onClick={() => setActiveTab("plan")}><ListVideo size={16} /> Episode Builder</button>
        <button className={activeTab === "intelligence" ? "active" : ""} onClick={() => setActiveTab("intelligence")}><BrainCircuit size={16} /> Intelligence</button>
        <button className={activeTab === "audience" ? "active" : ""} onClick={() => setActiveTab("audience")}><Users size={16} /> Audience</button>
      </nav>

      {activeTab === "plan" && <PlanView pathways={pathways} selectedPathway={selectedPathway} setSelectedPathway={setSelectedPathway} cues={cues} addScripture={addScripture} />}
      {activeTab === "intelligence" && <IntelligenceView pathway={selectedPathway} coverage={coverage} />}
      {activeTab === "audience" && <AudienceView />}
    </main>
  );
}

function PlanView({ pathways, selectedPathway, setSelectedPathway, cues, addScripture }: { pathways: StudioPathway[]; selectedPathway: StudioPathway; setSelectedPathway: (pathway: StudioPathway) => void; cues: Cue[]; addScripture: (step: StudioPathway["steps"][number]) => void }) {
  return <div className="ag-studio-grid">
    <section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">Source</span><h2>Pathways</h2></div><Route size={20} /></header><div className="ag-studio-pathway-picker">{pathways.map((pathway) => <button key={pathway.slug} className={selectedPathway.slug === pathway.slug ? "selected" : ""} onClick={() => setSelectedPathway(pathway)}><span>{pathway.title}</span><small>{pathway.steps.length} steps</small></button>)}</div></section>
    <section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">Assets</span><h2>{selectedPathway.title}</h2></div><BookOpen size={20} /></header><p className="ag-studio-muted">{selectedPathway.summary}</p><div className="ag-studio-step-list">{selectedPathway.steps.map((step, index) => { const added = cues.some((cue) => cue.id === `${selectedPathway.slug}:${step.reference}`); return <article key={`${step.reference}-${index}`}><span className="ag-studio-step-number">{String(index + 1).padStart(2, "0")}</span><div><strong>{step.reference}</strong><span>{step.title}</span><p>{step.explanation}</p></div><button disabled={added} onClick={() => addScripture(step)}>{added ? "Added" : "+ Cue"}</button></article>; })}</div></section>
    <section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">Draft</span><h2>Run of show</h2></div><Radio size={20} /></header><div className="ag-studio-episode-title"><span>PREVIEW BUILDER</span><strong>Pathway-based episode</strong><small>Primary pathway: {selectedPathway.title}</small></div><div className="ag-studio-cues">{cues.map((cue, index) => <div className="ag-studio-cue" key={cue.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{cue.label}</strong><small>{cue.detail}</small></div></div>)}</div></section>
  </div>;
}

function IntelligenceView({ pathway, coverage }: { pathway: StudioPathway; coverage: Array<StudioPathway["steps"][number] & { state: string }> }) {
  return <div className="ag-studio-intelligence-layout"><section className="ag-studio-panel ag-studio-intro-card"><span className="ag-studio-eyebrow"><Sparkles size={14}/> Episode intelligence</span><h2>Organize around what has actually been covered.</h2><p>Recommendations use pathway coverage, audience questions, polls, and existing episodes. AI drafts. AG remains the source of truth.</p></section><section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">Coverage</span><h2>{pathway.title}</h2></div><Activity size={20}/></header><div className="ag-studio-coverage">{coverage.map((item) => <div key={item.reference}><span className={`coverage-dot ${item.state}`}/><strong>{item.reference}</strong><span>{item.title}</span><small>{item.state === "covered" ? "Covered" : item.state === "partial" ? "Partial" : "Opportunity"}</small></div>)}</div></section><section className="ag-studio-panel ag-studio-recommendation"><span className="ag-studio-priority">HIGH PRIORITY</span><h2>Why does Jesus pray to the Father?</h2><p>A strong next episode that connects divine identity to the genuine humanity of Christ and bridges multiple AG pathways.</p><button className="ag-studio-primary"><Sparkles size={16}/> Build episode draft</button></section></div>;
}

function AudienceView() {
  return <div className="ag-studio-audience-layout"><section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">AG Live</span><h2>Questions</h2></div><MessageSquareText size={20}/></header><div className="ag-studio-placeholder">Live questions are managed inside each real episode and production session.</div></section><section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">AG Live</span><h2>Polls</h2></div><Vote size={20}/></header><div className="ag-studio-placeholder">Create, open, close, and display polls from the episode audience panel.</div></section><section className="ag-studio-panel"><header><div><span className="ag-studio-eyebrow">Identity</span><h2>One AG account</h2></div><Users size={20}/></header><div className="ag-studio-access-row"><span>Public</span><strong>Watch</strong></div><div className="ag-studio-access-row"><span>AG account</span><strong>Questions + polls</strong></div><div className="ag-studio-access-row"><span>Members</span><strong>Optional gated sessions</strong></div></section></div>;
}
