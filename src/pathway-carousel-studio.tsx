"use client";

import { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Image as ImageIcon,
  Layers3,
  Loader2,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  WandSparkles
} from "lucide-react";
import { toPng } from "html-to-image";
import { MODE_STYLE_DEFAULTS } from "@/carousel-design-rules";

type StudioPathway = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  steps: { title: string; reference: string; explanation: string }[];
};
type CarouselMode = "pathway" | "informational" | "word-study" | "verse-connection" | "app-guide";
type VisualStyle = "street" | "editorial" | "cinematic" | "verse" | "manifesto";
type SlideKind = "cover" | "scripture" | "statement" | "connection" | "cta";
type TemplateHint = "standard" | "verse-connection" | "manifesto";
type OutputFormat = "instagram-carousel" | "instagram-post" | "story" | "youtube-thumbnail" | "youtube-visualizer" | "x-facebook" | "pdf" | "website";
type CarouselSlide = {
  id: string;
  kind: SlideKind;
  eyebrow: string;
  title: string;
  body: string;
  reference: string;
  secondaryReference: string;
  templateHint: TemplateHint;
};
type LayoutState = {
  copyY: number;
  headlineScale: number;
  bodyScale: number;
  bodyWidth: number;
  align: "left" | "center" | "right";
  titleWidth: number;
  headlineLines: number;
  copyGap: number;
};
type AiPlan = { title: string; rationale: string; slides: Omit<CarouselSlide, "id">[] };
type FormatSpec = { label: string; purpose: string; width: number; height: number; icon: "layers" | "image" | "story" | "video" | "pdf" | "web" };
type SelectedLayer = "headline" | "body" | null;
type DoctrineIssue = { severity: "warning" | "block"; category: string; slideId: string; quote: string; explanation: string; suggestion: string };
type DoctrineReview = { status: "pass" | "warning" | "blocked"; summary: string; issues: DoctrineIssue[] };

const OUTPUTS: Record<OutputFormat, FormatSpec> = {
  "instagram-carousel": { label: "Instagram Carousel", purpose: "Swipe post", width: 1080, height: 1350, icon: "layers" },
  "instagram-post": { label: "Instagram Post", purpose: "Single 4:5 graphic", width: 1080, height: 1350, icon: "image" },
  story: { label: "Story", purpose: "9:16 story / reel cover", width: 1080, height: 1920, icon: "story" },
  "youtube-thumbnail": { label: "YouTube Thumbnail", purpose: "16:9 thumbnail", width: 1280, height: 720, icon: "video" },
  "youtube-visualizer": { label: "YouTube Visualizer", purpose: "16:9 static scene", width: 1920, height: 1080, icon: "video" },
  "x-facebook": { label: "X / Facebook", purpose: "Feed graphic", width: 1200, height: 1500, icon: "image" },
  pdf: { label: "PDF", purpose: "Print / save as PDF", width: 1080, height: 1350, icon: "pdf" },
  website: { label: "Website Artwork", purpose: "Wide editorial asset", width: 1600, height: 1000, icon: "web" }
};

const DEFAULT_LAYOUT: LayoutState = {
  copyY: 49,
  headlineScale: 1,
  bodyScale: 1,
  bodyWidth: 78,
  align: "center",
  titleWidth: 90,
  headlineLines: 0,
  copyGap: 2.3
};

const REMIX_RECIPES: LayoutState[] = [
  DEFAULT_LAYOUT,
  { ...DEFAULT_LAYOUT, copyY: 45, headlineScale: .88, bodyWidth: 68, titleWidth: 82, copyGap: 1.7 },
  { ...DEFAULT_LAYOUT, copyY: 52, headlineScale: .8, bodyScale: .94, bodyWidth: 72, align: "left", titleWidth: 84, headlineLines: 2, copyGap: 2.8 },
  { ...DEFAULT_LAYOUT, copyY: 47, headlineScale: .94, align: "right", titleWidth: 80, copyGap: 1.3 },
  { ...DEFAULT_LAYOUT, copyY: 55, headlineScale: .74, bodyScale: 1.04, bodyWidth: 64, titleWidth: 74, headlineLines: 3, copyGap: 3.2 }
];

const MODE_LABELS: Record<CarouselMode, { label: string; description: string }> = {
  pathway: { label: "Pathway Guide", description: "Walk through a live Scripture Pathway." },
  informational: { label: "Informational", description: "Teach one topic in a clear sequence." },
  "word-study": { label: "Word Study", description: "Explore a biblical word, phrase, or text." },
  "verse-connection": { label: "Verse Connections", description: "Build a carousel around linked passages." },
  "app-guide": { label: "How to Use the App", description: "Show people how to study with Apostolic Guide." }
};

function fitClass(text: string) {
  const length = text.replace(/\s+/g, " ").trim().length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (length > 105 || words > 16) return "fit-xxl";
  if (length > 78 || words > 12) return "fit-xl";
  if (length > 54 || words > 9) return "fit-lg";
  if (length > 34 || words > 6) return "fit-md";
  return "fit-sm";
}

function defaultLayoutFor(style: VisualStyle, slide: CarouselSlide): LayoutState {
  if (style === "verse" || slide.templateHint === "verse-connection" || slide.kind === "connection") {
    return { ...DEFAULT_LAYOUT, copyY: 49, headlineScale: .9, bodyScale: .96, bodyWidth: 86, titleWidth: 88, copyGap: 3.1, align: "center" };
  }
  if (style === "editorial") {
    const centered = slide.kind === "cover" || slide.kind === "cta" || (slide.title.split(/\s+/).length <= 4 && slide.body.length < 110);
    return { ...DEFAULT_LAYOUT, copyY: 48, headlineScale: .9, bodyScale: .94, bodyWidth: 78, titleWidth: 84, copyGap: 2.8, align: centered ? "center" : "left" };
  }
  if (style === "cinematic") {
    return { ...DEFAULT_LAYOUT, copyY: 50, headlineScale: .88, bodyScale: .96, bodyWidth: 72, titleWidth: 82, copyGap: 2.5, align: "center" };
  }
  if (style === "manifesto") {
    return { ...DEFAULT_LAYOUT, copyY: 50, headlineScale: .88, bodyScale: .92, bodyWidth: 68, titleWidth: 82, copyGap: 2.8, align: "center" };
  }
  const longTeaching = slide.body.length > 150 || slide.title.split(/\s+/).length > 8;
  return { ...DEFAULT_LAYOUT, copyY: 49, headlineScale: longTeaching ? .84 : .94, bodyScale: .96, bodyWidth: longTeaching ? 76 : 72, titleWidth: longTeaching ? 84 : 86, copyGap: 2.4, align: longTeaching ? "left" : "center" };
}

function buildPathwaySlides(pathway: StudioPathway): CarouselSlide[] {
  const scripture = pathway.steps.slice(0, 5).map((step, index) => ({
    id: String(index + 2).padStart(2, "0"),
    kind: index % 2 === 0 ? "scripture" as const : "statement" as const,
    eyebrow: step.title.toUpperCase(),
    title: step.explanation.replace(/[.!?].*$/, " ").trim().toUpperCase(),
    body: step.explanation,
    reference: step.reference.toUpperCase(),
    secondaryReference: "",
    templateHint: "standard" as const
  }));
  return [
    { id: "01", kind: "cover", eyebrow: "APOSTOLIC GUIDE · PATHWAY", title: pathway.title.toUpperCase(), body: pathway.summary, reference: "", secondaryReference: "", templateHint: "standard" },
    ...scripture,
    { id: String(scripture.length + 2).padStart(2, "0"), kind: "statement", eyebrow: "THE THREAD", title: pathway.title.toUpperCase(), body: pathway.summary, reference: "SCRIPTURE IN CONTEXT", secondaryReference: "", templateHint: "manifesto" },
    { id: String(scripture.length + 3).padStart(2, "0"), kind: "cta", eyebrow: "KEEP STUDYING", title: `FOLLOW THE ${pathway.title.toUpperCase()} PATHWAY`, body: "Read every passage in sequence, see the connections, and continue the study on Apostolic Guide.", reference: "APOSTOLICGUIDE.COM", secondaryReference: "", templateHint: "standard" }
  ];
}

function buildConnectionSlides(pathway: StudioPathway): CarouselSlide[] {
  const pairs = pathway.steps.slice(0, 6);
  const slides: CarouselSlide[] = [{
    id: "01",
    kind: "cover",
    eyebrow: "VERSE CONNECTIONS",
    title: pathway.title.toUpperCase(),
    body: "Follow the passages that illuminate one another.",
    reference: "SCRIPTURE WITH SCRIPTURE",
    secondaryReference: "",
    templateHint: "verse-connection"
  }];
  for (let index = 0; index < Math.min(5, pairs.length - 1); index += 1) {
    slides.push({
      id: String(slides.length + 1).padStart(2, "0"),
      kind: "connection",
      eyebrow: "VERSE CONNECTION",
      title: pairs[index].reference.toUpperCase(),
      body: pairs[index].explanation,
      reference: pairs[index].reference.toUpperCase(),
      secondaryReference: pairs[index + 1].reference.toUpperCase(),
      templateHint: "verse-connection"
    });
  }
  slides.push({
    id: String(slides.length + 1).padStart(2, "0"),
    kind: "cta",
    eyebrow: "FOLLOW THE THREAD",
    title: "KEEP READING THE CONNECTIONS",
    body: pathway.summary,
    reference: "APOSTOLICGUIDE.COM",
    secondaryReference: "",
    templateHint: "standard"
  });
  return slides;
}

function buildAppGuideSlides(): CarouselSlide[] {
  const steps = [
    ["START WITH A QUESTION", "Search a verse, phrase, doctrine, or objection and open the strongest Scripture trail."],
    ["OPEN A PATHWAY", "Follow a curated sequence instead of jumping between isolated proof texts."],
    ["READ THE CONNECTIONS", "Move from one passage to supporting, parallel, contrast, and response passages."],
    ["USE CONVERSATION MODE", "Keep the next verse and the reason it matters close at hand during a real conversation."],
    ["PRESENT THE STUDY", "Use the same Scripture flow when teaching or presenting the topic."],
    ["SAVE YOUR OWN FLOW", "Turn the passages you use most into a personal study path."]
  ];
  return [
    { id: "01", kind: "cover", eyebrow: "APOSTOLIC GUIDE", title: "HOW TO USE THE APP", body: "A Scripture-first workflow for study, conversation, and teaching.", reference: "", secondaryReference: "", templateHint: "standard" },
    ...steps.map((step, index) => ({ id: String(index + 2).padStart(2, "0"), kind: "statement" as const, eyebrow: `STEP ${index + 1}`, title: step[0], body: step[1], reference: "APOSTOLIC GUIDE", secondaryReference: "", templateHint: index === 5 ? "manifesto" as const : "standard" as const })),
    { id: "08", kind: "cta", eyebrow: "STUDY WITH CONTEXT", title: "OPEN APOSTOLIC GUIDE", body: "Start with the question in front of you and let Scripture carry the weight.", reference: "APOSTOLICGUIDE.COM", secondaryReference: "", templateHint: "manifesto" }
  ];
}

function buildModeSlides(pathway: StudioPathway, mode: CarouselMode) {
  if (mode === "verse-connection") return buildConnectionSlides(pathway);
  if (mode === "app-guide") return buildAppGuideSlides();
  return buildPathwaySlides(pathway);
}

function outputIcon(icon: FormatSpec["icon"]) {
  if (icon === "layers") return <Layers3 size={19}/>;
  if (icon === "video") return <MonitorPlay size={19}/>;
  if (icon === "pdf") return <FileText size={19}/>;
  return <ImageIcon size={19}/>;
}

function balancedLines(text: string, count: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (count <= 0) return [text];
  if (count === 1) return [words.join(" ")];
  if (words.length <= count) return words;
  const lines: string[] = [];
  const target = words.join(" ").length / count;
  let line = "";
  for (const word of words) {
    if (lines.length < count - 1 && line && line.length + 1 + word.length > target) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  while (lines.length < count && lines.at(-1)?.includes(" ")) {
    const last = lines.pop()!;
    const parts = last.split(" ");
    const half = Math.ceil(parts.length / 2);
    lines.push(parts.slice(0, half).join(" "), parts.slice(half).join(" "));
  }
  return lines.filter(Boolean).slice(0, count);
}

export function PathwayCarouselStudio({ pathways, aiReady }: { pathways: StudioPathway[]; aiReady: boolean }) {
  const initialSlug = pathways.find((pathway) => pathway.slug === "jesus-is-god")?.slug ?? pathways[0]?.slug ?? "";
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const [mode, setMode] = useState<CarouselMode>("pathway");
  const [style, setStyle] = useState<VisualStyle>("street");
  const [output, setOutput] = useState<OutputFormat>("instagram-carousel");
  const [activeIndex, setActiveIndex] = useState(0);
  const [grain, setGrain] = useState(62);
  const [overrides, setOverrides] = useState<Record<string, Partial<CarouselSlide>>>({});
  const [layoutOverrides, setLayoutOverrides] = useState<Record<string, LayoutState>>({});
  const [remixIndexes, setRemixIndexes] = useState<Record<string, number>>({});
  const [aiPlan, setAiPlan] = useState<AiPlan | null>(null);
  const [creativePrompt, setCreativePrompt] = useState("Create a concise Scripture-first carousel from this source.");
  const [adjustPrompt, setAdjustPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedLayer, setSelectedLayer] = useState<SelectedLayer>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [doctrine, setDoctrine] = useState<DoctrineReview | null>(null);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const baseSlides = useMemo(() => selected ? buildModeSlides(selected, mode) : [], [selected, mode]);
  const generatedSlides = useMemo(() => aiPlan ? aiPlan.slides.map((slide, index) => ({ ...slide, id: String(index + 1).padStart(2, "0") })) : baseSlides, [aiPlan, baseSlides]);
  const draftKey = `${selectedSlug}:${mode}`;
  const slides = useMemo(() => generatedSlides.map((slide) => ({ ...slide, ...(overrides[`${draftKey}:${slide.id}`] ?? {}) })), [generatedSlides, overrides, draftKey]);
  const active = slides[Math.min(activeIndex, Math.max(0, slides.length - 1))];
  const activeLayoutKey = active ? `${draftKey}:${active.id}` : "";
  const activeLayout = active ? (layoutOverrides[activeLayoutKey] ?? defaultLayoutFor(style, active)) : DEFAULT_LAYOUT;
  const format = OUTPUTS[output];

  if (!selected || !active) return <div className="studio-empty-state"><strong>No Pathways are available.</strong></div>;

  function updateActive(patch: Partial<CarouselSlide>) {
    const key = `${draftKey}:${active.id}`;
    setOverrides((current) => ({ ...current, [key]: { ...(current[key] ?? {}), ...patch } }));
    setDoctrine(null);
  }

  function updateLayout(patch: Partial<LayoutState>) {
    const next = { ...activeLayout, ...patch };
    setLayoutOverrides((current) => ({ ...current, [activeLayoutKey]: next }));
  }

  function resetActiveLayout() {
    setLayoutOverrides((current) => {
      const next = { ...current };
      delete next[activeLayoutKey];
      return next;
    });
  }

  function changePathway(slug: string) {
    setSelectedSlug(slug);
    setActiveIndex(0);
    setAiPlan(null);
    setDoctrine(null);
    setMessage("");
  }

  function changeMode(next: CarouselMode) {
    setMode(next);
    setStyle(MODE_STYLE_DEFAULTS[next] as VisualStyle);
    setActiveIndex(0);
    setAiPlan(null);
    setDoctrine(null);
    setMessage("");
    if (next === "word-study") setCreativePrompt("Create a word study of Deuteronomy 6:4, focusing on the Hebrew wording, the confession of one LORD, and how the text functions in context.");
    else if (next === "verse-connection") setCreativePrompt("Build a verse-connection carousel showing how the strongest passages in this topic illuminate one another.");
    else if (next === "app-guide") setCreativePrompt("Show a first-time user how to use Apostolic Guide to study a doctrine from question to Scripture pathway.");
    else setCreativePrompt("Create a concise Scripture-first carousel from this source.");
  }

  async function checkDoctrine(targetSlides = slides, silent = false) {
    if (!aiReady || busy) return;
    setBusy("doctrine");
    if (!silent) setMessage("Checking doctrine and Scripture fidelity…");
    try {
      const response = await fetch("/api/admin/carousel-studio/check-doctrine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, mode, prompt: creativePrompt, slides: targetSlides })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Doctrine check failed.");
      setDoctrine(data.review);
      setMessage(`${data.review.status.toUpperCase()}: ${data.review.summary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Doctrine check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function generateWithAi() {
    if (!aiReady || busy) return;
    setBusy("generate");
    setMessage("Planning carousel…");
    try {
      const response = await fetch("/api/admin/carousel-studio/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug: selected.slug, mode, prompt: creativePrompt, targetSlides: 8 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Carousel could not be generated.");
      setAiPlan(data.plan);
      setStyle((data.preferredStyle as VisualStyle | undefined) ?? MODE_STYLE_DEFAULTS[mode] as VisualStyle);
      setActiveIndex(0);
      setDoctrine(null);
      setMessage(`${data.plan.slides.length} slides planned. Run doctrine check before export.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Carousel could not be generated.");
    } finally {
      setBusy(null);
    }
  }

  async function adjustWithAi() {
    if (!aiReady || busy || !adjustPrompt.trim()) return;
    setBusy("adjust");
    setMessage(`Adjusting slide ${active.id}…`);
    try {
      const response = await fetch("/api/admin/carousel-studio/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: adjustPrompt, slide: active, layout: activeLayout })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Layout could not be adjusted.");
      setLayoutOverrides((current) => ({ ...current, [activeLayoutKey]: data.layout }));
      setMessage(data.summary ? `Slide ${active.id}: ${data.summary}` : `Slide ${active.id} adjusted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Layout could not be adjusted.");
    } finally {
      setBusy(null);
    }
  }

  function remix() {
    const index = (remixIndexes[activeLayoutKey] ?? 0) + 1;
    const recipeIndex = index % REMIX_RECIPES.length;
    const recipe = { ...REMIX_RECIPES[recipeIndex] };
    setRemixIndexes((current) => ({ ...current, [activeLayoutKey]: recipeIndex }));
    setLayoutOverrides((current) => ({ ...current, [activeLayoutKey]: recipe }));
    setGrain((value) => value >= 78 ? 46 : value + 8);
    setMessage(`Slide ${active.id} remix ${recipeIndex + 1}/${REMIX_RECIPES.length}: hierarchy changed without changing copy.`);
  }

  async function downloadNode(node: HTMLDivElement, filename: string) {
    const dataUrl = await toPng(node, { width: format.width, height: format.height, pixelRatio: 1, cacheBust: true });
    const anchor = document.createElement("a");
    anchor.download = filename;
    anchor.href = dataUrl;
    anchor.click();
  }

  async function exportCurrent() {
    if (busy) return;
    if (output === "pdf") {
      document.documentElement.classList.add("carousel-printing");
      window.setTimeout(() => {
        window.print();
        window.setTimeout(() => document.documentElement.classList.remove("carousel-printing"), 600);
      }, 80);
      return;
    }
    const node = exportRefs.current[active.id];
    if (!node) return;
    setBusy("export");
    try { await downloadNode(node, `${selected.slug}-${output}-${active.id}.png`); }
    finally { setBusy(null); }
  }

  async function exportAll() {
    if (busy) return;
    if (output === "pdf") return void exportCurrent();
    setBusy("export");
    try {
      for (const slide of slides) {
        const node = exportRefs.current[slide.id];
        if (!node) continue;
        await downloadNode(node, `${selected.slug}-${output}-${slide.id}.png`);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } finally {
      setBusy(null);
    }
  }

  const manualPanel = manualOpen ? (
    <div className="carousel-manual-panel">
      <div className="carousel-manual-heading"><strong>Manual constraints</strong><span>Slide {active.id} only · {selectedLayer ? `editing ${selectedLayer}` : "tap headline or body"}</span></div>
      <label><span>Vertical position</span><input type="range" min="30" max="68" step="1" value={activeLayout.copyY} onChange={(event) => updateLayout({ copyY: Number(event.target.value) })}/><b>{activeLayout.copyY}%</b></label>
      <label><span>Headline size</span><input type="range" min="50" max="120" step="1" value={Math.round(activeLayout.headlineScale * 100)} onChange={(event) => updateLayout({ headlineScale: Number(event.target.value) / 100 })}/><b>{Math.round(activeLayout.headlineScale * 100)}%</b></label>
      <label><span>Headline width</span><input type="range" min="46" max="98" step="1" value={activeLayout.titleWidth} onChange={(event) => updateLayout({ titleWidth: Number(event.target.value) })}/><b>{activeLayout.titleWidth}%</b></label>
      <label><span>Headline lines</span><select value={activeLayout.headlineLines} onChange={(event) => updateLayout({ headlineLines: Number(event.target.value) })}><option value="0">Auto</option><option value="1">1 line</option><option value="2">2 lines</option><option value="3">3 lines</option><option value="4">4 lines</option><option value="5">5 lines</option></select></label>
      <label><span>Body size</span><input type="range" min="65" max="125" step="1" value={Math.round(activeLayout.bodyScale * 100)} onChange={(event) => updateLayout({ bodyScale: Number(event.target.value) / 100 })}/><b>{Math.round(activeLayout.bodyScale * 100)}%</b></label>
      <label><span>Body width</span><input type="range" min="42" max="94" step="1" value={activeLayout.bodyWidth} onChange={(event) => updateLayout({ bodyWidth: Number(event.target.value) })}/><b>{activeLayout.bodyWidth}%</b></label>
      <label><span>Spacing</span><input type="range" min="5" max="50" step="1" value={Math.round(activeLayout.copyGap * 10)} onChange={(event) => updateLayout({ copyGap: Number(event.target.value) / 10 })}/><b>{activeLayout.copyGap.toFixed(1)}</b></label>
      <div className="carousel-align-buttons">{(["left", "center", "right"] as const).map((align) => <button type="button" key={align} className={activeLayout.align === align ? "is-active" : ""} onClick={() => updateLayout({ align })}>{align}</button>)}</div>
      <button type="button" className="button" onClick={resetActiveLayout}><RefreshCw size={14}/> Reset this slide</button>
    </div>
  ) : null;

  return <div className="carousel-studio-page">
    <div className="studio-page-heading carousel-studio-heading">
      <div><span className="eyebrow">Publishing · Lab</span><h1>Carousel Studio</h1><p className="admin-lede">Pathway → content plan → visual assets → templates → exports. Manual corrections stay with the current slide and export exactly as shown.</p></div>
      <div className="carousel-heading-actions">
        <button className="button" onClick={() => void checkDoctrine()} disabled={!aiReady || Boolean(busy)}><ShieldCheck size={16}/> Check doctrine</button>
        <button className="button" onClick={exportCurrent} disabled={Boolean(busy)}><Download size={16}/> {output === "pdf" ? "Print / PDF" : "Export current"}</button>
        <button className="button primary" onClick={exportAll} disabled={Boolean(busy)}><Layers3 size={16}/> {busy === "export" ? "Rendering…" : output === "instagram-carousel" ? "Export carousel" : "Export set"}</button>
      </div>
    </div>

    {message ? <div className="admin-notice">{message}</div> : null}
    {doctrine ? <section className={`admin-card carousel-doctrine is-${doctrine.status}`}>
      <div><span className="section-kicker">Doctrine checker</span><h2>{doctrine.status === "pass" ? "Ready for review" : doctrine.status === "warning" ? "Review warnings" : "Blocked"}</h2><p>{doctrine.summary}</p></div>
      <span className="carousel-doctrine-status">{doctrine.status === "pass" ? <CheckCircle2 size={17}/> : <ShieldCheck size={17}/>} {doctrine.status}</span>
      {doctrine.issues.length ? <div className="carousel-doctrine-issues">{doctrine.issues.map((issue, index) => <article key={`${issue.slideId}-${index}`}><strong>Slide {issue.slideId} · {issue.category}</strong><span>{issue.quote}</span><p>{issue.explanation}</p><small>{issue.suggestion}</small></article>)}</div> : null}
    </section> : null}

    <section className="carousel-sourcebar admin-card">
      <label><span>Pathway / source</span><select value={selected.slug} onChange={(event) => changePathway(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
      <label><span>Carousel type</span><select value={mode} onChange={(event) => changeMode(event.target.value as CarouselMode)}>{(Object.keys(MODE_LABELS) as CarouselMode[]).map((key) => <option key={key} value={key}>{MODE_LABELS[key].label}</option>)}</select></label>
      <div className="carousel-source-status"><span className="status-dot is-ready"/><div><strong>{slides.length} slides</strong><small>{MODE_LABELS[mode].description}</small></div></div>
      <div className="carousel-source-status"><span className={aiReady ? "status-dot is-ready" : "status-dot"}/><div><strong>{aiReady ? "AI director ready" : "AI not configured"}</strong><small>Content + layout + doctrine</small></div></div>
    </section>

    <section className="admin-card carousel-ai-brief">
      <div className="carousel-card-heading"><div><span className="section-kicker">Content plan</span><h2>Direct the carousel</h2></div><span>{MODE_LABELS[mode].label}</span></div>
      <div className="carousel-ai-brief-grid">
        <label><span>Prompt / topic</span><textarea rows={3} value={creativePrompt} onChange={(event) => setCreativePrompt(event.target.value)} placeholder="Example: Do a word study of Deuteronomy 6:4…"/></label>
        <button className="button primary" disabled={!aiReady || Boolean(busy) || creativePrompt.trim().length < 3} onClick={() => void generateWithAi()}>{busy === "generate" ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>} Generate material</button>
      </div>
    </section>

    <div className="carousel-studio-grid">
      <section className="admin-card carousel-preview-card">
        <div className="carousel-card-heading">
          <div><span className="section-kicker">Master-template preview</span><h2>{aiPlan?.title || selected.title}</h2></div>
          <button className={manualOpen ? "button small is-active" : "button small"} onClick={() => setManualOpen((value) => !value)}><SlidersHorizontal size={15}/> Manual layout</button>
        </div>
        <div className="carousel-preview-stage">
          <div className={`carousel-artboard is-${style} is-${active.kind} is-hint-${active.templateHint} ${format.width > format.height ? "is-landscape" : format.height / format.width > 1.55 ? "is-vertical" : "is-portrait"}`} style={{ aspectRatio: `${format.width}/${format.height}` }}>
            <CarouselArtwork slide={active} index={activeIndex} total={slides.length} grain={grain} layout={activeLayout} visualStyle={style} editable={manualOpen} selectedLayer={selectedLayer} onSelectLayer={setSelectedLayer}/>
          </div>
        </div>
        <div className="carousel-preview-nav">
          <button onClick={() => setActiveIndex((activeIndex - 1 + slides.length) % slides.length)}><ChevronLeft size={20}/></button>
          <strong>{active.id} / {String(slides.length).padStart(2, "0")}</strong>
          <button onClick={() => setActiveIndex((activeIndex + 1) % slides.length)}><ChevronRight size={20}/></button>
        </div>
        {manualPanel}
        <div className="carousel-style-tabs">{(["street", "editorial", "cinematic", "verse", "manifesto"] as VisualStyle[]).map((key) => <button key={key} className={style === key ? "is-active" : ""} onClick={() => setStyle(key)}><strong>{key === "street" ? "Street Theology" : key === "editorial" ? "Brand White Editorial" : key === "cinematic" ? "Cinematic" : key === "verse" ? "Verse Connection" : "Manifesto"}</strong><span>{key === "street" ? "Texture + hard type" : key === "editorial" ? "Brand white + editorial" : key === "cinematic" ? "Dark + restrained" : key === "verse" ? "Paired verses" : "Single statement"}</span></button>)}</div>
      </section>

      <section className="admin-card carousel-editor-card">
        <div className="carousel-card-heading"><div><span className="section-kicker">Carousel sequence</span><h2>Slides + art direction</h2></div><button className="button small" onClick={remix}><RefreshCw size={15}/> Remix slide</button></div>
        <p className="carousel-editor-help">Copy and layout edits are isolated to the selected slide. They persist into export without changing the rest of the carousel.</p>
        <div className="carousel-slide-list">{slides.map((slide, index) => <button key={slide.id} className={index === activeIndex ? "carousel-slide-row is-selected" : "carousel-slide-row"} onClick={() => setActiveIndex(index)}><span>{slide.id}</span><div><strong>{slide.title}</strong><small>{slide.kind} · {slide.secondaryReference ? `${slide.reference} → ${slide.secondaryReference}` : slide.reference || "cover"}</small></div></button>)}</div>
        <div className="carousel-fields">
          <label><span>Eyebrow</span><input value={active.eyebrow} onChange={(event) => updateActive({ eyebrow: event.target.value })}/></label>
          <label><span>Headline</span><textarea rows={3} value={active.title} onChange={(event) => updateActive({ title: event.target.value })}/></label>
          <label><span>Body</span><textarea rows={4} value={active.body} onChange={(event) => updateActive({ body: event.target.value })}/></label>
          <div className="carousel-field-pair"><label><span>Reference</span><input value={active.reference} onChange={(event) => updateActive({ reference: event.target.value })}/></label><label><span>Second reference</span><input value={active.secondaryReference} onChange={(event) => updateActive({ secondaryReference: event.target.value })}/></label></div>
        </div>
        <div className="carousel-ai-adjust">
          <label><span>AI adjust · slide {active.id}</span><textarea rows={2} value={adjustPrompt} onChange={(event) => setAdjustPrompt(event.target.value)} placeholder="Make this slide two lines, move it up, give the body more room…"/></label>
          <button className="button" disabled={!aiReady || Boolean(busy) || !adjustPrompt.trim()} onClick={() => void adjustWithAi()}>{busy === "adjust" ? <Loader2 className="spin" size={15}/> : <WandSparkles size={15}/>} Apply to slide</button>
        </div>
      </section>
    </div>

    <section className="admin-card carousel-output-card">
      <div className="carousel-card-heading"><div><span className="section-kicker">Exports</span><h2>One content plan, multiple outputs</h2></div><span>Review → export → publishing</span></div>
      <div className="carousel-output-grid">{(Object.keys(OUTPUTS) as OutputFormat[]).map((key) => { const spec = OUTPUTS[key]; return <button key={key} className={output === key ? "carousel-output-option is-active" : "carousel-output-option"} onClick={() => setOutput(key)}><i>{outputIcon(spec.icon)}</i><span><strong>{spec.label}</strong><small>{spec.width} × {spec.height} · {spec.purpose}</small></span></button>; })}</div>
    </section>

    <div className="carousel-export-host" aria-hidden="true">{slides.map((slide, index) => {
      const key = `${draftKey}:${slide.id}`;
      const slideLayout = layoutOverrides[key] ?? defaultLayoutFor(style, slide);
      return <div key={slide.id} className={`carousel-export-artboard is-${style} is-${slide.kind} is-hint-${slide.templateHint} ${format.width > format.height ? "is-landscape" : format.height / format.width > 1.55 ? "is-vertical" : "is-portrait"}`} style={{ width: format.width, height: format.height }} ref={(node) => { exportRefs.current[slide.id] = node; }}><CarouselArtwork slide={slide} index={index} total={slides.length} grain={grain} layout={slideLayout} visualStyle={style}/></div>;
    })}</div>
  </div>;
}

function CarouselArtwork({ slide, index, total, grain, layout, visualStyle, editable = false, selectedLayer = null, onSelectLayer }: {
  slide: CarouselSlide;
  index: number;
  total: number;
  grain: number;
  layout: LayoutState;
  visualStyle: VisualStyle;
  editable?: boolean;
  selectedLayer?: SelectedLayer;
  onSelectLayer?: (layer: SelectedLayer) => void;
}) {
  const style = {
    "--carousel-grain": grain / 100,
    "--copy-y": `${layout.copyY}%`,
    "--headline-scale": layout.headlineScale,
    "--body-scale": layout.bodyScale,
    "--body-width": `${layout.bodyWidth}%`,
    "--title-width": `${layout.titleWidth}%`,
    "--copy-align": layout.align,
    "--copy-gap": `${layout.copyGap}cqw`
  } as React.CSSProperties;
  const lines = balancedLines(slide.title, layout.headlineLines);
  const lightSurface = visualStyle === "editorial" || visualStyle === "verse";
  const logo = lightSurface ? "/brand/apostolic-guide-mark.png" : "/brand/apostolic-guide-mark-reversed.png";
  const verseConnection = slide.kind === "connection" || slide.templateHint === "verse-connection";

  return <div className="carousel-artwork" style={style}>
    <div className="carousel-ambient carousel-ambient-red"/>
    <div className="carousel-ambient carousel-ambient-blue"/>
    <div className="carousel-grain"/>
    <div className="carousel-city"/>
    <img className="carousel-brand-mark" src={logo} alt=""/>
    <div className="carousel-pathway-label">SCRIPTURE PATHWAY</div>
    {verseConnection ? <VerseConnection slide={slide} layout={layout}/> : <div className="carousel-copy">
      <span>{slide.eyebrow}</span>
      <strong className={`${fitClass(slide.title)} ${editable ? "is-editable" : ""} ${selectedLayer === "headline" ? "is-selected-layer" : ""}`} onClick={editable ? (event) => { event.stopPropagation(); onSelectLayer?.("headline"); } : undefined}>{lines.map((line, lineIndex) => <i key={`${line}-${lineIndex}`}>{line}</i>)}</strong>
      {slide.body ? <p className={`${editable ? "is-editable" : ""} ${selectedLayer === "body" ? "is-selected-layer" : ""}`} onClick={editable ? (event) => { event.stopPropagation(); onSelectLayer?.("body"); } : undefined}>{slide.body}</p> : null}
      {slide.reference ? <em>{slide.reference}</em> : null}
    </div>}
    <div className="carousel-footer"><span>APOSTOLICGUIDE.COM</span><span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div>
  </div>;
}

function VerseConnection({ slide, layout }: { slide: CarouselSlide; layout: LayoutState }) {
  const style = {
    "--copy-y": `${layout.copyY}%`,
    "--headline-scale": layout.headlineScale,
    "--body-scale": layout.bodyScale,
    "--body-width": `${layout.bodyWidth}%`,
    "--copy-align": layout.align,
    "--copy-gap": `${layout.copyGap}cqw`
  } as React.CSSProperties;
  return <div className="carousel-verse-connection" style={style}>
    <span>VERSE CONNECTION</span>
    <strong>{slide.reference || slide.title}</strong>
    <p>{slide.body}</p>
    {slide.secondaryReference ? <><i>↓</i><strong>{slide.secondaryReference}</strong></> : null}
  </div>;
}
