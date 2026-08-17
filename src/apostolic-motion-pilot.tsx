"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clapperboard, Loader2, Play, Save, Sparkles } from "lucide-react";
import { ApostolicMotionCanvas } from "./apostolic-motion-canvas";
import {
  apostolicMotionEngineStyle,
  apostolicMotionVisualLabel,
  buildApostolicMotionPlan
} from "./apostolic-motion-engine";
import {
  buildEstimatedPathwayVideoTimeline,
  formatVideoTimestamp,
  type PathwayVideoCue,
  type PathwayVideoStep
} from "./pathway-video";

type MotionPilotProject = {
  id: string;
  audioContentHash: string | null;
  timeline: PathwayVideoCue[] | null;
  style: Record<string, unknown>;
  updatedAt: string;
};

type MotionPilotPathway = {
  slug: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  steps: PathwayVideoStep[];
  audioUrl: string | null;
  audioContentHash: string | null;
  scriptApproved: boolean;
  project: MotionPilotProject | null;
};

function defaultPilotSlug(pathways: MotionPilotPathway[]) {
  const godIsOne = pathways.find((pathway) => pathway.slug === "god-is-one" && pathway.audioUrl);
  if (godIsOne) return godIsOne.slug;
  return pathways.find((pathway) => pathway.audioUrl)?.slug ?? pathways[0]?.slug ?? "";
}

export function ApostolicMotionPilot({ pathways, databaseReady, rendererReady }: {
  pathways: MotionPilotPathway[];
  databaseReady: boolean;
  rendererReady: boolean;
}) {
  const [selectedSlug, setSelectedSlug] = useState(() => defaultPilotSlug(pathways));
  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDuration(0);
    setCurrentTime(0);
    setSaved(false);
    setMessage("");
  }, [selectedSlug]);

  const effectiveDuration = duration || Math.max(60, (selected?.estimatedMinutes ?? 2) * 60);
  const timeline = useMemo(() => {
    if (!selected) return [];
    if (selected.project?.timeline?.length) return selected.project.timeline;
    return buildEstimatedPathwayVideoTimeline(selected, effectiveDuration);
  }, [selected, effectiveDuration]);
  const plan = useMemo(() => selected ? buildApostolicMotionPlan(selected, timeline, effectiveDuration) : null, [selected, timeline, effectiveDuration]);
  const hasDirectedTimeline = Boolean(selected?.project?.timeline?.length);
  const pilotEnd = Math.min(plan?.pilotWindowSeconds ?? 90, effectiveDuration);

  function seek(seconds: number, play = false) {
    if (!audioRef.current) return;
    const next = Math.max(0, Math.min(seconds, audioRef.current.duration || effectiveDuration));
    audioRef.current.currentTime = next;
    setCurrentTime(next);
    if (play) void audioRef.current.play().catch(() => undefined);
  }

  async function saveMotionDirection() {
    if (!selected || !plan || !selected.project?.timeline?.length || !databaseReady) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/video-studio/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: selected.slug,
          timeline: selected.project.timeline,
          style: {
            ...(selected.project.style ?? {}),
            brandVersion: 3,
            template: "apostolic-motion-v1",
            motionEngine: apostolicMotionEngineStyle(plan)
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Motion direction could not be saved.");
      setSaved(true);
      setMessage("Motion direction saved. The renderer will use this exact scene plan.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Motion direction could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!selected || !plan) return null;

  return <section className="admin-card apostolic-motion-pilot">
    <div className="motion-pilot-head">
      <div>
        <span className="section-kicker">New · Apostolic Motion Engine 0.1</span>
        <h2>Illustrated explainer pilot</h2>
        <p>One evolving canvas. SOL supplies the teaching beats, deterministic motion grammar turns them into repeatable scenes, and the renderer reads the same saved plan.</p>
      </div>
      <div className="motion-pilot-status"><span className="is-live"/><div><strong>{selected.slug === "god-is-one" ? "God Is One pilot" : "Motion preview"}</strong><small>{plan.scenes.length} scenes · first {Math.round(pilotEnd)} seconds locked for review</small></div></div>
    </div>

    <div className="motion-pilot-sourcebar">
      <label><span>Pathway</span><select value={selected.slug} onChange={(event) => setSelectedSlug(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}{pathway.audioUrl ? "" : " · no audio"}</option>)}</select></label>
      <div className="motion-pilot-facts">
        <div><span>Direction</span><strong>{hasDirectedTimeline ? "SOL timeline" : "Estimated preview"}</strong></div>
        <div><span>Style</span><strong>Illustrated + draw-on</strong></div>
        <div><span>Render</span><strong>{rendererReady ? "Renderer connected" : "Preview only"}</strong></div>
      </div>
      <div className="motion-pilot-actions">
        <button type="button" className="button" disabled={!selected.audioUrl} onClick={() => seek(0, true)}><Play size={15}/> Play pilot</button>
        <button type="button" className="button primary" disabled={!databaseReady || !hasDirectedTimeline || busy} onClick={() => void saveMotionDirection()}>{busy ? <Loader2 className="spin" size={15}/> : saved ? <Check size={15}/> : <Save size={15}/>} {saved ? "Motion saved" : "Save motion direction"}</button>
      </div>
    </div>

    {!hasDirectedTimeline ? <div className="motion-pilot-note"><Sparkles size={16}/><div><strong>Previewing from the deterministic fallback.</strong><span>Run Analyze &amp; direct in Video Studio before saving so the Motion Engine rides the approved narration instead of replacing it.</span></div></div> : null}
    {message ? <div className="motion-pilot-message">{message}</div> : null}

    <div className="motion-pilot-stage">
      <ApostolicMotionCanvas plan={plan} currentTime={currentTime} format="youtube"/>
    </div>

    {selected.audioUrl ? <audio
      ref={audioRef}
      className="motion-pilot-audio"
      controls
      preload="metadata"
      src={selected.audioUrl}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onEnded={() => setCurrentTime(duration || effectiveDuration)}
    /> : <div className="motion-pilot-note"><Clapperboard size={16}/><div><strong>No Pathway audio yet.</strong><span>Generate the approved narration first. The scene plan can be previewed, but timing cannot be locked.</span></div></div>}

    <div className="motion-pilot-timeline" aria-label="Motion scene timeline">
      {plan.scenes.filter((scene) => scene.start <= pilotEnd + 0.01).map((scene, index) => {
        const active = currentTime >= scene.start && currentTime < scene.end;
        return <button type="button" key={scene.id} className={active ? "is-active" : ""} onClick={() => seek(scene.start, true)}>
          <span>{formatVideoTimestamp(scene.start)}</span>
          <strong>{scene.headline || scene.reference || `Scene ${index + 1}`}</strong>
          <small>{apostolicMotionVisualLabel(scene.visual)}</small>
        </button>;
      })}
    </div>

    <div className="motion-pilot-rule"><strong>V1 rule:</strong><span>No random generated footage. God is never represented as a second human figure. Divine presence uses light, glory, line, word, and symbolic form. Character-like figures are reserved for genuine humanity and biblical people.</span></div>
  </section>;
}
