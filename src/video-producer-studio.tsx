"use client";

import { useMemo, useState } from "react";
import { Check, Film, Music2, Play, Scissors, Sparkles, Upload, WandSparkles } from "lucide-react";
import {
  compileVideoProducerRenderPlan,
  formatProducerTime,
  type VideoProducerEditPlan,
  type VideoProducerOverlay
} from "@/video-producer";

const SAMPLE_OVERLAYS: VideoProducerOverlay[] = [];

export function VideoProducerStudio() {
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [plan, setPlan] = useState<VideoProducerEditPlan | null>(null);
  const [approved, setApproved] = useState(false);

  const renderPlan = useMemo(() => plan ? compileVideoProducerRenderPlan(plan) : null, [plan]);

  function onFile(file?: File) {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceName(file.name);
    setSourceUrl(URL.createObjectURL(file));
    setPlan(null);
    setApproved(false);
  }

  function generatePlan() {
    if (!duration) return;
    const lines = transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const overlays = lines
      .map((line, index) => {
        const scripture = line.match(/\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?/i);
        if (!scripture) return null;
        return {
          id: `overlay-${index + 1}`,
          kind: "scripture" as const,
          start: Math.min(duration - 0.1, Math.max(0, (index / Math.max(1, lines.length)) * duration)),
          duration: 7,
          title: scripture[0],
          reference: scripture[0],
          body: line
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    setPlan({
      version: 1,
      sourceDuration: duration,
      cuts: [],
      overlays: overlays.length ? overlays : SAMPLE_OVERLAYS,
      music: [],
      audioPreset: "ag-voice-clean",
      colorPreset: "ag-studio",
      intro: true,
      outro: true
    });
    setApproved(false);
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-[#ff3b3b]">Apostolic Guide Media</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Video Producer</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Transcript-driven post production. AI makes editorial decisions. The render engine performs repeatable cuts, audio, color, graphics, music and delivery.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/65">{approved ? "APPROVED" : plan ? "PLAN READY" : sourceName ? "SOURCE READY" : "NEW PROJECT"}</div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.55fr_.8fr]">
          <section className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
              <div className="aspect-video bg-[radial-gradient(circle_at_center,#182033_0%,#080b11_52%,#030405_100%)]">
                {sourceUrl ? (
                  <video className="h-full w-full object-contain" controls src={sourceUrl} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)} />
                ) : (
                  <label className="flex h-full cursor-pointer flex-col items-center justify-center gap-4 text-white/45">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><Upload size={30}/></div>
                    <div className="text-center"><div className="font-bold text-white/80">Drop in the raw episode</div><div className="mt-1 text-xs">MP4, MOV or browser-playable video</div></div>
                    <input className="hidden" type="file" accept="video/*" onChange={(event) => onFile(event.target.files?.[0])}/>
                  </label>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-xs text-white/50">
                <span>{sourceName || "No source selected"}</span>
                <span>{duration ? formatProducerTime(duration) : "0:00"}</span>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-4 flex items-center justify-between"><div><div className="text-sm font-bold">Transcript</div><div className="mt-1 text-xs text-white/45">Paste a transcript now. Word-level transcription plugs into this same contract next.</div></div><Sparkles size={18} className="text-[#4c8dff]"/></div>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste the episode transcript here..." className="min-h-72 w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-4 text-sm leading-7 text-white outline-none placeholder:text-white/25 focus:border-[#4c8dff]/60"/>
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#ff3b3b]/10 p-2 text-[#ff5757]"><WandSparkles size={19}/></div><div><div className="font-bold">Producer pass</div><div className="text-xs text-white/45">Build the edit decision list</div></div></div>
              <div className="space-y-3 text-sm">
                {[['Tighten edit', Scissors], ['AG voice chain', Music2], ['AG Studio grade', Film], ['Intro + outro', Play]].map(([label, Icon]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-3"><span className="flex items-center gap-2 text-white/70"><Icon size={15}/>{String(label)}</span><Check size={15} className="text-emerald-400"/></div>)}
              </div>
              <button disabled={!duration} onClick={generatePlan} className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-30">GENERATE EDIT PLAN</button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-4 text-sm font-bold">Edit plan</div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Raw" value={duration ? formatProducerTime(duration) : "0:00"}/>
                <Metric label="Edited" value={renderPlan ? formatProducerTime(renderPlan.outputDuration) : "0:00"}/>
                <Metric label="Cuts" value={String(plan?.cuts.length ?? 0)}/>
                <Metric label="Overlays" value={String(plan?.overlays.length ?? 0)}/>
              </div>
              {plan?.overlays.length ? <div className="mt-4 space-y-2">{plan.overlays.slice(0, 6).map((overlay) => <div key={overlay.id} className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4c8dff]">{overlay.kind} · {formatProducerTime(overlay.start)}</div><div className="mt-1 text-sm font-semibold">{overlay.title}</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">No decisions generated yet.</div>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="text-sm font-bold">Render handoff</div><p className="mt-2 text-xs leading-5 text-white/45">The plan compiles into keep segments, remapped overlays, media presets and output settings. A worker can execute it without asking the language model to touch the video frames.</p>
              <button disabled={!renderPlan} onClick={() => setApproved(true)} className="mt-4 w-full rounded-xl bg-[#e72c33] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-30">{approved ? "APPROVED FOR RENDER" : "APPROVE EDIT"}</button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-white/35">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}
