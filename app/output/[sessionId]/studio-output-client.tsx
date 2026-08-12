"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudioProgramState } from "@/studio/types";

type OutputAsset = {
  id: string;
  asset_type: string;
  label?: string | null;
  snapshot_data?: Record<string, unknown> | null;
  custom_data?: Record<string, unknown> | null;
};

type OutputSnapshot = {
  state: StudioProgramState | null;
  stateVersion: number;
  assets: OutputAsset[];
  session: { studio_episodes?: { title?: string } | null };
};

export default function StudioOutputClient({ sessionId, token }: { sessionId: string; token: string }) {
  const [snapshot, setSnapshot] = useState<OutputSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const response = await fetch(`/api/studio/output/${sessionId}?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("output unavailable");
        const next = await response.json() as OutputSnapshot;
        if (alive) {
          setSnapshot((current) => !current || next.stateVersion >= current.stateVersion ? next : current);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) timer = setTimeout(refresh, 750);
      }
    }

    refresh();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [sessionId, token]);

  const assets = useMemo(() => new Map((snapshot?.assets ?? []).map((asset) => [asset.id, asset])), [snapshot?.assets]);
  const state = snapshot?.state;
  const scripture = state?.activeScriptureId ? assets.get(state.activeScriptureId) : undefined;
  const question = state?.activeQuestionId ? assets.get(state.activeQuestionId) : undefined;

  if (!token) return <main className="studio-output studio-output-error">Output token required</main>;
  if (!snapshot && failed) return <main className="studio-output studio-output-error">Output unavailable</main>;
  if (!state) return <main className="studio-output studio-output-holding"><AGMark /><p>Preparing broadcast</p></main>;

  return (
    <main className={`studio-output scene-${state.currentSceneId}`}>
      <div className="studio-output-bg" />
      <Scene sceneId={state.currentSceneId} episodeTitle={snapshot?.session?.studio_episodes?.title} scripture={scripture} question={question} />
      <div className="studio-output-overlays">
        {[...state.activeOverlays].sort((a, b) => a.layer - b.layer).map((overlay) => <Overlay key={overlay.id} asset={overlay.assetId ? assets.get(overlay.assetId) : undefined} type={overlay.type} />)}
      </div>
      {failed ? <span className="studio-output-reconnecting">Reconnecting</span> : null}
    </main>
  );
}

function Scene({ sceneId, episodeTitle, scripture, question }: { sceneId: string; episodeTitle?: string; scripture?: OutputAsset; question?: OutputAsset }) {
  if (sceneId === "black") return <div className="studio-black" />;
  if (sceneId === "holding") return <div className="studio-center-card"><AGMark /><span>APOSTOLIC GUIDE</span><h1>We’ll be right back.</h1><p>Please stand by.</p></div>;
  if (sceneId === "scripture-full") return <ScriptureCard asset={scripture} full />;
  if (sceneId === "question-full") return <QuestionCard asset={question} full />;
  if (sceneId === "pathway-cta") return <div className="studio-center-card"><span>KEEP STUDYING</span><h1>{episodeTitle ?? "Apostolic Guide"}</h1><p>Continue through the complete Scripture pathway on Apostolic Guide.</p></div>;
  if (sceneId === "host-scripture") return <div className="studio-split"><div className="studio-camera-placeholder"><AGMark /><span>HOST CAMERA</span></div><ScriptureCard asset={scripture} /></div>;
  if (sceneId === "title-full") return <div className="studio-center-card"><span>APOSTOLIC GUIDE</span><h1>{episodeTitle ?? "Live"}</h1></div>;
  return <div className="studio-camera-placeholder studio-camera-full"><AGMark /><span>HOST CAMERA</span></div>;
}

function ScriptureCard({ asset, full = false }: { asset?: OutputAsset; full?: boolean }) {
  const data = asset?.snapshot_data ?? {};
  return <div className={`studio-scripture ${full ? "full" : ""}`}><span>SCRIPTURE</span><h2>{String(data.reference ?? asset?.label ?? "Scripture")}</h2><p>{String(data.text ?? data.explanation ?? "Scripture text will appear here when the canonical text asset is connected.")}</p></div>;
}

function QuestionCard({ asset, full = false }: { asset?: OutputAsset; full?: boolean }) {
  const data = asset?.custom_data ?? asset?.snapshot_data ?? {};
  return <div className={`studio-question ${full ? "full" : ""}`}><span>QUESTION</span><h2>{String(data.question ?? asset?.label ?? "Live question")}</h2></div>;
}

function Overlay({ asset, type }: { asset?: OutputAsset; type: string }) {
  const data = asset?.custom_data ?? asset?.snapshot_data ?? {};
  if (type === "lower_third") return <div className="studio-lower-third"><strong>{String(data.primaryText ?? asset?.label ?? "Apostolic Guide")}</strong><span>{String(data.secondaryText ?? "")}</span></div>;
  if (type === "question") return <div className="studio-question-overlay">{String(data.question ?? asset?.label ?? "Question")}</div>;
  if (type === "cta") return <div className="studio-cta-overlay">{String(data.text ?? asset?.label ?? "Continue on Apostolic Guide")}</div>;
  return null;
}

function AGMark() { return <div className="studio-ag-mark">AG</div>; }
