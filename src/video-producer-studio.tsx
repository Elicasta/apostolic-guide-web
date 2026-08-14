"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Captions, Check, Film, Music2, Play, Scissors, Smartphone, Sparkles, Type, Upload, WandSparkles, ZoomIn } from "lucide-react";
import {
  buildDefaultVideoProducerPlan,
  compileVideoProducerRenderPlan,
  formatProducerTime,
  VIDEO_PRODUCER_MODE_DEFAULTS,
  type VideoProducerCaptionStyle,
  type VideoProducerEditPlan,
  type VideoProducerMode,
  type VideoProducerOverlay
} from "@/video-producer";

const SAMPLE_OVERLAYS: VideoProducerOverlay[] = [];
const CAPTION_STYLES: { id: VideoProducerCaptionStyle; label: string; description: string }[] = [
  { id: "kinetic-clean", label: "Kinetic Clean", description: "AG default. Fast emphasis without looking like generic creator captions." },
  { id: "word-pop", label: "Word Pop", description: "Higher-energy word emphasis for hooks and strong statements." },
  { id: "editorial", label: "Editorial", description: "Larger composed cards for theology, quotes and teaching clips." },
  { id: "minimal", label: "Minimal", description: "Low-motion captions when the footage should stay dominant." }
];

const SCRIPTURE_PATTERN = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d{1,3}:\d{1,3}(?:-\d{1,3})?/i;

export function VideoProducerStudio() {
  const [mode, setMode] = useState<VideoProducerMode>("podcast");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [captionStyle, setCaptionStyle] = useState<VideoProducerCaptionStyle>("kinetic-clean");
  const [plan, setPlan] = useState<VideoProducerEditPlan | null>(null);
  const [approved, setApproved] = useState(false);

  const renderPlan = useMemo(() => plan ? compileVideoProducerRenderPlan(plan) : null, [plan]);
  const defaults = VIDEO_PRODUCER_MODE_DEFAULTS[mode];

  function selectMode(nextMode: VideoProducerMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setCaptionStyle(nextMode === "reels" ? "kinetic-clean" : "minimal");
    setPlan(null);
    setApproved(false);
  }

  function onFile(file?: File) {
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    setSourceName(file.name);
    setSourceUrl(URL.createObjectURL(file));
    setDuration(0);
    setPlan(null);
    setApproved(false);
  }

  function generatePlan() {
    if (!duration) return;
    const lines = transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const overlays = lines
      .map((line, index) => {
        const scripture = line.match(SCRIPTURE_PATTERN);
        if (!scripture) return null;
        return {
          id: `overlay-${index + 1}`,
          kind: "scripture" as const,
          start: Math.min(Math.max(0, duration - 0.1), Math.max(0, (index / Math.max(1, lines.length)) * duration)),
          duration: mode === "reels" ? 4.5 : 7,
          title: scripture[0],
          reference: scripture[0],
          body: line
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const nextPlan = buildDefaultVideoProducerPlan(mode, duration, overlays.length ? overlays : SAMPLE_OVERLAYS);
    if (mode === "reels") nextPlan.captions.style = captionStyle;
    setPlan(nextPlan);
    setApproved(false);
  }

  const passItems = mode === "podcast"
    ? [
        { label: "Long-form tighten pass", icon: Scissors },
        { label: "AG voice cleanup", icon: Music2 },
        { label: "Professional 16:9 grade", icon: Film },
        { label: "Chapters + Scripture graphics", icon: Type },
        { label: "Intro + outro package", icon: Play }
      ]
    : [
        { label: "Retention edit", icon: Scissors },
        { label: "Animated captions", icon: Captions },
        { label: "Smart 9:16 reframing", icon: Smartphone },
        { label: "Punch-ins + emphasis", icon: ZoomIn },
        { label: "Scripture + CTA overlays", icon: Type }
      ];

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.28em] text-[#ff3b3b]">Apostolic Guide Media</div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Video Producer</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Two production lanes. Podcast Mode builds the polished long-form master. Reels Producer builds the fast vertical version with captions, motion and social graphics.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white/65">{approved ? "APPROVED" : plan ? "PLAN READY" : sourceName ? "SOURCE READY" : "NEW PROJECT"}</div>
        </div>

        <section className="mb-6 grid gap-3 lg:grid-cols-2">
          <ModeCard
            active={mode === "podcast"}
            eyebrow="LONG FORM"
            title="Podcast Mode"
            description="Professional episode production. Tight edits, clean dialogue, color, chapters, Scripture graphics, intro/outro and a finished YouTube master."
            spec="16:9 · 1920×1080"
            icon={<Film size={21}/>} 
            onClick={() => selectMode("podcast")}
          />
          <ModeCard
            active={mode === "reels"}
            eyebrow="SHORT FORM"
            title="Reels Producer"
            description="Retention-first vertical editing. Animated captions, punch-ins, reframing, branded text, Scripture overlays and CTA motion."
            spec="9:16 · 1080×1920"
            icon={<Smartphone size={21}/>} 
            onClick={() => selectMode("reels")}
          />
        </section>

        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs text-white/50">
          <Sparkles size={15} className="text-[#4c8dff]"/>
          <span><strong className="text-white/80">{defaults.label}:</strong> {defaults.description}</span>
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
                    <div className="text-center"><div className="font-bold text-white/80">Drop in the raw video</div><div className="mt-1 text-xs">MP4, MOV or browser-playable video</div></div>
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
              <div className="mb-4 flex items-center justify-between">
                <div><div className="text-sm font-bold">Transcript</div><div className="mt-1 text-xs text-white/45">The edit director will work from word-level timestamps. Manual transcript input stays available for correction.</div></div>
                <Sparkles size={18} className="text-[#4c8dff]"/>
              </div>
              <textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={mode === "podcast" ? "Paste the episode transcript here..." : "Paste the reel transcript or selected clip transcript here..."} className="min-h-72 w-full resize-y rounded-2xl border border-white/10 bg-black/40 p-4 text-sm leading-7 text-white outline-none placeholder:text-white/25 focus:border-[#4c8dff]/60"/>
            </div>

            {mode === "reels" && (
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
                <div className="mb-4"><div className="text-sm font-bold">Caption direction</div><div className="mt-1 text-xs text-white/45">Style is part of the render plan, not baked into random AI choices.</div></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {CAPTION_STYLES.map((style) => (
                    <button key={style.id} type="button" onClick={() => { setCaptionStyle(style.id); setPlan(null); setApproved(false); }} className={`rounded-2xl border p-4 text-left transition ${captionStyle === style.id ? "border-[#4c8dff]/60 bg-[#4c8dff]/10" : "border-white/8 bg-black/20 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">{style.label}</span>{captionStyle === style.id && <Check size={15} className="text-[#6aa2ff]"/>}</div>
                      <div className="mt-2 text-xs leading-5 text-white/45">{style.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
              <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-[#ff3b3b]/10 p-2 text-[#ff5757]"><WandSparkles size={19}/></div><div><div className="font-bold">{mode === "podcast" ? "Podcast producer pass" : "Reels producer pass"}</div><div className="text-xs text-white/45">Build the mode-specific edit decision list</div></div></div>
              <div className="space-y-3 text-sm">
                {passItems.map(({ label, icon: Icon }) => <div key={label} className="flex items-center justify-between rounded-xl border border-white/8 bg-black/20 px-3 py-3"><span className="flex items-center gap-2 text-white/70"><Icon size={15}/>{label}</span><Check size={15} className="text-emerald-400"/></div>)}
              </div>
              <button disabled={!duration} onClick={generatePlan} className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-30">GENERATE {mode === "podcast" ? "PODCAST" : "REEL"} EDIT PLAN</button>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="mb-4 flex items-center justify-between gap-3"><div className="text-sm font-bold">Edit plan</div>{renderPlan && <div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#4c8dff]">{renderPlan.output.width}×{renderPlan.output.height}</div>}</div>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Raw" value={duration ? formatProducerTime(duration) : "0:00"}/>
                <Metric label="Edited" value={renderPlan ? formatProducerTime(renderPlan.outputDuration) : "0:00"}/>
                <Metric label="Cuts" value={String(plan?.cuts.length ?? 0)}/>
                <Metric label={mode === "reels" ? "Graphics" : "Overlays"} value={String(plan?.overlays.length ?? 0)}/>
              </div>
              {mode === "reels" && plan && (
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-black/25 px-3 py-3 text-xs"><span className="text-white/45">Captions</span><span className="font-bold text-white/80">{CAPTION_STYLES.find((style) => style.id === plan.captions.style)?.label ?? plan.captions.style}</span></div>
              )}
              {plan?.overlays.length ? <div className="mt-4 space-y-2">{plan.overlays.slice(0, 6).map((overlay) => <div key={overlay.id} className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#4c8dff]">{overlay.kind} · {formatProducerTime(overlay.start)}</div><div className="mt-1 text-sm font-semibold">{overlay.title}</div></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">No decisions generated yet.</div>}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <div className="text-sm font-bold">Render handoff</div>
              <p className="mt-2 text-xs leading-5 text-white/45">The worker gets normalized cuts, remapped graphics, remapped music, motion directions, caption settings, media presets and the exact output geometry. The model never edits video frames directly.</p>
              <button disabled={!renderPlan} onClick={() => setApproved(true)} className="mt-4 w-full rounded-xl bg-[#e72c33] px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-30">{approved ? "APPROVED FOR RENDER" : "APPROVE EDIT"}</button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ModeCard({ active, eyebrow, title, description, spec, icon, onClick }: { active: boolean; eyebrow: string; title: string; description: string; spec: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`group rounded-3xl border p-5 text-left transition ${active ? "border-[#4c8dff]/60 bg-[linear-gradient(135deg,rgba(76,141,255,.14),rgba(231,44,51,.06))] shadow-[0_0_40px_rgba(76,141,255,.08)]" : "border-white/10 bg-white/[0.025] hover:border-white/20"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className={`rounded-2xl border p-3 ${active ? "border-[#4c8dff]/30 bg-[#4c8dff]/10 text-[#78aaff]" : "border-white/10 bg-black/20 text-white/55"}`}>{icon}</div>
        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[.16em] text-white/45">{spec}</div>
      </div>
      <div className="mt-5 text-[10px] font-bold uppercase tracking-[.22em] text-[#ff5757]">{eyebrow}</div>
      <div className="mt-1 text-2xl font-black">{title}</div>
      <div className="mt-2 max-w-xl text-xs leading-5 text-white/50">{description}</div>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/70">{active ? <><Check size={14} className="text-emerald-400"/> ACTIVE LANE</> : "SELECT LANE"}</div>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-white/35">{label}</div><div className="mt-1 text-xl font-black">{value}</div></div>;
}
