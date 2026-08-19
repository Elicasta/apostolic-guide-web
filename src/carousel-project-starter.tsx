"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CAROUSEL_PROJECT_MODES,
  CAROUSEL_PROJECT_MODE_DESCRIPTIONS,
  CAROUSEL_PROJECT_MODE_LABELS,
  creativeIntentForCarouselMode,
  defaultCarouselTopic,
  type CarouselProjectMode
} from "@/carousel-project-modes";
import { CREATIVE_FORMAT_LABELS, CREATIVE_FORMATS, type CreativeFormat } from "@/creative-project";

type PathwayOption = { slug: string; title: string; collection: string; summary: string; steps: Array<{ reference: string; title: string; explanation: string }> };

type ProjectResponse = { project?: { id: string }; error?: string };

export function CarouselProjectStarter({ pathways, aiReady }: { pathways: PathwayOption[]; aiReady: boolean }) {
  const router = useRouter();
  const [pathwaySlug, setPathwaySlug] = useState(pathways[0]?.slug ?? "");
  const [mode, setMode] = useState<CarouselProjectMode>("pathway");
  const [format, setFormat] = useState<CreativeFormat>("carousel");
  const [topic, setTopic] = useState(() => pathways[0] ? defaultCarouselTopic("pathway", pathways[0]) : "");
  const [topicDirty, setTopicDirty] = useState(false);
  const [overrideCount, setOverrideCount] = useState(false);
  const [frameCount, setFrameCount] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pathway = useMemo(() => pathways.find((item) => item.slug === pathwaySlug) ?? pathways[0], [pathwaySlug, pathways]);

  function applyContext(nextSlug: string, nextMode: CarouselProjectMode) {
    const nextPathway = pathways.find((item) => item.slug === nextSlug) ?? pathways[0];
    if (!topicDirty && nextPathway) setTopic(defaultCarouselTopic(nextMode, nextPathway));
  }

  async function create() {
    if (!pathway) return;
    setBusy(true);
    setError("");
    try {
      const createResponse = await fetch("/api/admin/creative-projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathwaySlug: pathway.slug,
          intent: creativeIntentForCarouselMode(mode),
          format,
          carouselMode: mode,
          topic: topic.trim() || defaultCarouselTopic(mode, pathway),
          ...(overrideCount && format !== "single" ? { frameCount } : {})
        })
      });
      const created = await createResponse.json().catch(() => ({})) as ProjectResponse;
      if (!createResponse.ok || !created.project?.id) throw new Error(created.error || "Creative Project could not be created.");

      if (aiReady) {
        const generation = await fetch("/api/admin/creative-studio/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: created.project.id,
            action: "generate",
            instruction: topic.trim() || defaultCarouselTopic(mode, pathway),
            ...(overrideCount && format !== "single" ? { targetFrameCount: frameCount } : {})
          })
        });
        const generated = await generation.json().catch(() => ({})) as { error?: string };
        if (!generation.ok) throw new Error(generated.error || "Sol could not generate this project.");
      }
      router.push(`/admin/carousel-studio?project=${created.project.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project could not be created.");
      setBusy(false);
    }
  }

  return <section className="carousel-project-starter">
    <div className="carousel-project-starter-head">
      <div><span>New creative</span><h1>What are we making?</h1><p>Your prompt drives the actual idea. The selected Pathway supplies doctrine and Scripture. Only Pathway Guide intentionally follows the Pathway itself as the outline.</p></div>
    </div>
    <div className="carousel-project-starter-grid">
      <label>Pathway
        <select value={pathwaySlug} onChange={(event) => { const value = event.target.value; setPathwaySlug(value); applyContext(value, mode); }}>
          {pathways.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}
        </select>
      </label>
      <label>{format === "carousel" ? "Carousel type" : "Creative purpose"}
        <select value={mode} onChange={(event) => { const value = event.target.value as CarouselProjectMode; setMode(value); applyContext(pathwaySlug, value); }}>
          {CAROUSEL_PROJECT_MODES.map((item) => <option value={item} key={item}>{CAROUSEL_PROJECT_MODE_LABELS[item]}</option>)}
        </select>
        <small>{CAROUSEL_PROJECT_MODE_DESCRIPTIONS[mode]}</small>
      </label>
      <label>Format
        <select value={format} onChange={(event) => setFormat(event.target.value as CreativeFormat)}>
          {CREATIVE_FORMATS.map((item) => <option value={item} key={item}>{CREATIVE_FORMAT_LABELS[item]}</option>)}
        </select>
      </label>
      <label className="carousel-project-topic">Creative prompt
        <textarea rows={4} value={topic} onChange={(event) => { setTopic(event.target.value); setTopicDirty(true); }} placeholder={pathway ? defaultCarouselTopic(mode, pathway) : "Tell Sol the thought, question, objection, angle, word study, or practical emphasis you want to create."}/>
        <small><strong>Prompt = idea.</strong> Pathway = doctrinal boundary + Scripture bank. Sol also checks recent same-Pathway creatives so it does not keep recycling the same hook and sequence.</small>
      </label>
      {format !== "single" ? <div className="carousel-project-count">
        <label><input type="checkbox" checked={overrideCount} onChange={(event) => setOverrideCount(event.target.checked)}/> Choose slide count myself</label>
        {overrideCount ? <input aria-label="Slide count" type="number" min={1} max={12} value={frameCount} onChange={(event) => setFrameCount(Math.max(1, Math.min(12, Number(event.target.value))))}/> : <small>Sol will use the smallest useful sequence instead of padding to a fixed count.</small>}
      </div> : null}
    </div>
    {error ? <p className="creative-warning">{error}</p> : null}
    <button type="button" className="creative-primary carousel-project-create" disabled={busy || !pathwaySlug} onClick={() => void create()}>{busy ? <Loader2 size={16} className="spin"/> : <Sparkles size={16}/>} {aiReady ? "Create & Generate" : "Create Project"}</button>
  </section>;
}
