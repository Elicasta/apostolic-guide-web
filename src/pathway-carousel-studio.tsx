"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Image as ImageIcon, Layers3, Loader2, MonitorPlay, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { toPng } from "html-to-image";

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
  crownScale: number;
  slashY: number;
  slashWidth: number;
  align: "left" | "center" | "right";
  titleWidth: number;
};

type AiPlan = { title: string; rationale: string; slides: Omit<CarouselSlide, "id">[] };

type FormatSpec = { label: string; purpose: string; width: number; height: number; icon: "layers" | "image" | "story" | "video" | "pdf" | "web" };

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
  crownScale: 1,
  slashY: 20,
  slashWidth: 52,
  align: "center",
  titleWidth: 94
};

const REMIX_RECIPES: LayoutState[] = [
  DEFAULT_LAYOUT,
  { ...DEFAULT_LAYOUT, copyY: 45, headlineScale: .88, bodyWidth: 68, slashY: 17, slashWidth: 38, titleWidth: 82 },
  { ...DEFAULT_LAYOUT, copyY: 52, headlineScale: .82, bodyScale: .94, bodyWidth: 72, slashY: 27, slashWidth: 64, align: "left", titleWidth: 82 },
  { ...DEFAULT_LAYOUT, copyY: 46, headlineScale: .95, crownScale: .8, slashY: 64, slashWidth: 36, align: "right", titleWidth: 80 },
  { ...DEFAULT_LAYOUT, copyY: 55, headlineScale: .76, bodyScale: 1.06, bodyWidth: 64, crownScale: .72, slashY: 13, slashWidth: 74, titleWidth: 74 }
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

function buildPathwaySlides(pathway: StudioPathway): CarouselSlide[] {
  const scriptureSlides = pathway.steps.slice(0, 5).map((step, index) => ({
    id: String(index + 2).padStart(2, "0"),
    kind: index % 2 === 0 ? "scripture" as const : "statement" as const,
    eyebrow: step.title.toUpperCase(),
    title: step.explanation.replace(/[.!?].*$/, "").toUpperCase(),
    body: step.explanation,
    reference: step.reference.toUpperCase(),
    secondaryReference: "",
    templateHint: "standard" as const
  }));

  return [
    { id: "01", kind: "cover", eyebrow: "APOSTOLIC GUIDE · PATHWAY", title: pathway.title.toUpperCase(), body: pathway.summary, reference: "", secondaryReference: "", templateHint: "standard" },
    ...scriptureSlides,
    { id: String(scriptureSlides.length + 2).padStart(2, "0"), kind: "statement", eyebrow: "THE THREAD", title: pathway.title.toUpperCase(), body: pathway.summary, reference: "SCRIPTURE IN CONTEXT", secondaryReference: "", templateHint: "manifesto" },
    { id: String(scriptureSlides.length + 3).padStart(2, "0"), kind: "cta", eyebrow: "KEEP STUDYING", title: `FOLLOW THE ${pathway.title.toUpperCase()} PATHWAY`, body: "Read every passage in sequence, see the connections, and continue the study on Apostolic Guide.", reference: "APOSTOLICGUIDE.COM", secondaryReference: "", templateHint: "standard" }
  ];
}

function buildConnectionSlides(pathway: StudioPathway): CarouselSlide[] {
  const pairs = pathway.steps.slice(0, 6);
  const slides: CarouselSlide[] = [
    { id: "01", kind: "cover", eyebrow: "VERSE CONNECTIONS", title: pathway.title.toUpperCase(), body: "Follow the passages that illuminate one another.", reference: "SCRIPTURE WITH SCRIPTURE", secondaryReference: "", templateHint: "verse-connection" }
  ];
  for (let index = 0; index < Math.min(5, pairs.length - 1); index++) {
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
  slides.push({ id: String(slides.length + 1).padStart(2, "0"), kind: "cta", eyebrow: "FOLLOW THE THREAD", title: "KEEP READING THE CONNECTIONS", body: pathway.summary, reference: "APOSTOLICGUIDE.COM", secondaryReference: "", templateHint: "standard" });
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
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const baseSlides = useMemo(() => selected ? buildModeSlides(selected, mode) : [], [selected, mode]);
  const generatedSlides = useMemo(() => aiPlan ? aiPlan.slides.map((slide, index) => ({ ...slide, id: String(index + 1).padStart(2, "0") })) : baseSlides, [aiPlan, baseSlides]);
  const draftKey = `${selectedSlug}:${mode}`;
  const slides = useMemo(() => generatedSlides.map((slide) => ({ ...slide, ...(overrides[`${draftKey}:${slide.id}`] ?? {}) })), [generatedSlides, overrides, draftKey]);
  const active = slides[Math.min(activeIndex, Math.max(0, slides.length - 1))];
  const activeLayoutKey = active ? `${draftKey}:${active.id}` : "";
  const activeLayout = active ? layoutOverrides[activeLayoutKey] ?? DEFAULT_LAYOUT : DEFAULT_LAYOUT;
  const format = OUTPUTS[output];

  if (!selected || !active) return <div className="studio-empty-state"><strong>No Pathways are available.</strong></div>;

  function updateActive(patch: Partial<CarouselSlide>) {
    const key = `${draftKey}:${active.id}`;
    setOverrides((current) => ({ ...current, [key]: { ...(current[key] ?? {}), ...patch } }));
  }

  function changePathway(slug: string) {
    setSelectedSlug(slug);
    setActiveIndex(0);
    setAiPlan(null);
    setMessage("");
  }

  function changeMode(next: CarouselMode) {
    setMode(next);
    setActiveIndex(0);
    setAiPlan(null);
    setMessage("");
    if (next === "word-study") setCreativePrompt("Create a word study of Deuteronomy 6:4, focusing on the Hebrew wording, the confession of one LORD, and how the text functions in context.");
    else if (next === "verse-connection") setCreativePrompt("Build a verse-connection carousel showing how the strongest passages in this topic illuminate one another.");
    else if (next === "app-guide") setCreativePrompt("Show a first-time user how to use Apostolic Guide to study a doctrine from question to Scripture pathway.");
    else setCreativePrompt("Create a concise Scripture-first carousel from this source.");
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
      setActiveIndex(0);
      setMessage(`${data.plan.slides.length} slides planned · ${data.plan.rationale}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Carousel could not be generated.");
    } finally { setBusy(null); }
  }

  async function adjustWithAi() {
    if (!aiReady || busy || !adjustPrompt.trim()) return;
    setBusy("adjust");
    setMessage("Adjusting layout…");
    try {
      const response = await fetch("/api/admin/carousel-studio/adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: adjustPrompt, slide: active, layout: activeLayout })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Layout could not be adjusted.");
      setLayoutOverrides((current) => ({ ...current, [activeLayoutKey]: data.layout }));
      setMessage(data.summary || "Layout adjusted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Layout could not be adjusted.");
    } finally { setBusy(null); }
  }

  function remix() {
    const currentIndex = remixIndexes[activeLayoutKey] ?? 0;
    const nextIndex = (currentIndex + 1) % REMIX_RECIPES.length;
    const recipe = REMIX_RECIPES[nextIndex];
    setRemixIndexes((current) => ({ ...current, [activeLayoutKey]: nextIndex }));
    setLayoutOverrides((current) => ({ ...current, [activeLayoutKey]: recipe }));
    setGrain((value) => value >= 78 ? 46 : value + 8);
    setMessage(`Remix ${nextIndex + 1}/${REMIX_RECIPES.length}: layout hierarchy changed without changing the copy.`);
  }

  async function downloadNode(node: HTMLDivElement, filename: string) {
    const dataUrl = await toPng(node, { width: format.width, height: format.height, pixelRatio: 1, cacheBust: true });
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  async function exportCurrent() {
    if (busy) return;
    if (output === "pdf") {
      document.documentElement.classList.add("carousel-printing");
      window.setTimeout(() => { window.print(); window.setTimeout(() => document.documentElement.classList.remove("carousel-printing"), 600); }, 80);
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
    if (output === "pdf") {
      document.documentElement.classList.add("carousel-printing");
      window.setTimeout(() => { window.print(); window.setTimeout(() => document.documentElement.classList.remove("carousel-printing"), 600); }, 80);
      return;
    }
    setBusy("export");
    try {
      for (const slide of slides) {
        const node = exportRefs.current[slide.id];
        if (!node) continue;
        await downloadNode(node, `${selected.slug}-${output}-${slide.id}.png`);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } finally { setBusy(null); }
  }

  return <div className="carousel-studio-page">
    <div className="studio-page-heading carousel-studio-heading">
      <div>
        <span className="eyebrow">Publishing · Lab</span>
        <h1>Carousel Studio</h1>
        <p className="admin-lede">Pathway → content plan → visual assets → templates → exports. Build once, then adapt the same idea across social, video, PDF, and web artwork.</p>
      </div>
      <div className="carousel-heading-actions">
        <button type="button" className="button" onClick={exportCurrent} disabled={Boolean(busy)}><Download size={16}/> {output === "pdf" ? "Print / PDF" : "Export current"}</button>
        <button type="button" className="button primary" onClick={exportAll} disabled={Boolean(busy)}><Layers3 size={16}/> {busy === "export" ? "Rendering…" : output === "instagram-carousel" ? "Export carousel" : "Export set"}</button>
      </div>
    </div>

    {message ? <div className="admin-notice">{message}</div> : null}

    <section className="carousel-sourcebar admin-card">
      <label><span>Pathway / source</span><select value={selected.slug} onChange={(event) => changePathway(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
      <label><span>Carousel type</span><select value={mode} onChange={(event) => changeMode(event.target.value as CarouselMode)}>{(Object.keys(MODE_LABELS) as CarouselMode[]).map((key) => <option key={key} value={key}>{MODE_LABELS[key].label}</option>)}</select></label>
      <div className="carousel-source-status"><span className="status-dot is-ready"/><div><strong>{slides.length} slides</strong><small>{MODE_LABELS[mode].description}</small></div></div>
      <div className="carousel-source-status"><span className={aiReady ? "status-dot is-ready" : "status-dot"}/><div><strong>{aiReady ? "AI director ready" : "AI not configured"}</strong><small>{aiReady ? "Content + layout instructions" : "OPENAI_API_KEY required"}</small></div></div>
    </section>

    <section className="admin-card carousel-ai-brief">
      <div className="carousel-card-heading"><div><span className="section-kicker">Content plan</span><h2>Direct the carousel</h2></div><span>{MODE_LABELS[mode].label}</span></div>
      <div className="carousel-ai-brief-grid">
        <label><span>Prompt / topic</span><textarea rows={3} value={creativePrompt} onChange={(event) => setCreativePrompt(event.target.value)} placeholder="Example: Do a word study of Deuteronomy 6:4…"/></label>
        <button type="button" className="button primary" disabled={!aiReady || Boolean(busy) || creativePrompt.trim().length < 3} onClick={() => void generateWithAi()}>{busy === "generate" ? <Loader2 className="spin" size={16}/> : <Sparkles size={16}/>} Generate material</button>
      </div>
      <small className="carousel-ai-note">The live Pathway is context, not a cage. Your prompt can ask for a word study, teaching sequence, verse connections, or a new informational carousel while keeping the brand and Scripture-first structure.</small>
    </section>

    <div className="carousel-studio-grid">
      <section className="admin-card carousel-preview-card">
        <div className="carousel-card-heading"><div><span className="section-kicker">Master-template preview</span><h2>{aiPlan?.title || selected.title}</h2></div><span>{format.width} × {format.height}</span></div>
        <div className="carousel-preview-stage">
          <div className={`carousel-artboard is-${style} is-${active.kind} is-hint-${active.templateHint} ${format.width > format.height ? "is-landscape" : format.height / format.width > 1.55 ? "is-vertical" : "is-portrait"}`} style={{ aspectRatio: `${format.width}/${format.height}` }}>
            <CarouselArtwork slide={active} index={activeIndex} total={slides.length} grain={grain} layout={activeLayout}/>
          </div>
        </div>
        <div className="carousel-preview-nav">
          <button type="button" aria-label="Previous slide" onClick={() => setActiveIndex((activeIndex - 1 + slides.length) % slides.length)}><ChevronLeft size={20}/></button>
          <strong>{active.id} / {String(slides.length).padStart(2, "0")}</strong>
          <button type="button" aria-label="Next slide" onClick={() => setActiveIndex((activeIndex + 1) % slides.length)}><ChevronRight size={20}/></button>
        </div>
        <div className="carousel-style-tabs">
          {(["street", "editorial", "cinematic", "verse", "manifesto"] as VisualStyle[]).map((key) => <button type="button" key={key} className={style === key ? "is-active" : ""} onClick={() => setStyle(key)}><strong>{key === "street" ? "Street Theology" : key === "editorial" ? "Brand White Editorial" : key === "cinematic" ? "Cinematic" : key === "verse" ? "Verse Connection" : "Manifesto"}</strong><span>{key === "street" ? "Texture, paint, hard type" : key === "editorial" ? "Brand white, serif, annotation" : key === "cinematic" ? "Dark, restrained, image-led" : key === "verse" ? "Paired verses + connection" : "Belief statement + crown"}</span></button>)}
        </div>
      </section>

      <section className="admin-card carousel-editor-card">
        <div className="carousel-card-heading"><div><span className="section-kicker">Carousel sequence</span><h2>Slides + art direction</h2></div><button type="button" className="button small" onClick={remix}><RefreshCw size={15}/> Remix layout</button></div>
        <p className="carousel-editor-help">Long headlines auto-fit. Remix changes hierarchy, alignment, accent position, and scale while keeping copy intact.</p>
        <div className="carousel-slide-list">{slides.map((slide, index) => <button type="button" key={slide.id} className={index === activeIndex ? "carousel-slide-row is-selected" : "carousel-slide-row"} onClick={() => setActiveIndex(index)}><span>{slide.id}</span><div><strong>{slide.title}</strong><small>{slide.kind} · {slide.secondaryReference ? `${slide.reference} → ${slide.secondaryReference}` : slide.reference || "cover"}</small></div></button>)}</div>

        <div className="carousel-fields">
          <label><span>Eyebrow</span><input value={active.eyebrow} onChange={(event) => updateActive({ eyebrow: event.target.value })}/></label>
          <label><span>Headline</span><textarea rows={3} value={active.title} onChange={(event) => updateActive({ title: event.target.value })}/></label>
          <label><span>Body</span><textarea rows={4} value={active.body} onChange={(event) => updateActive({ body: event.target.value })}/></label>
          <div className="carousel-field-pair"><label><span>Reference</span><input value={active.reference} onChange={(event) => updateActive({ reference: event.target.value })}/></label><label><span>Second reference</span><input value={active.secondaryReference} onChange={(event) => updateActive({ secondaryReference: event.target.value })}/></label></div>
        </div>

        <div className="carousel-ai-adjust">
          <label><span>AI adjust</span><textarea rows={2} value={adjustPrompt} onChange={(event) => setAdjustPrompt(event.target.value)} placeholder="Move the title up, make the crown smaller, give the body more room…"/></label>
          <button type="button" className="button" disabled={!aiReady || Boolean(busy) || !adjustPrompt.trim()} onClick={() => void adjustWithAi()}>{busy === "adjust" ? <Loader2 className="spin" size={15}/> : <WandSparkles size={15}/>} Apply instruction</button>
        </div>
      </section>
    </div>

    <section className="admin-card carousel-output-card">
      <div className="carousel-card-heading"><div><span className="section-kicker">Exports</span><h2>One content plan, multiple outputs</h2></div><span>Nothing publishes from here</span></div>
      <div className="carousel-output-grid">{(Object.keys(OUTPUTS) as OutputFormat[]).map((key) => { const spec = OUTPUTS[key]; return <button type="button" key={key} className={output === key ? "carousel-output-option is-active" : "carousel-output-option"} onClick={() => setOutput(key)}><i>{outputIcon(spec.icon)}</i><span><strong>{spec.label}</strong><small>{spec.width} × {spec.height} · {spec.purpose}</small></span></button>; })}</div>
      <div className="carousel-distribution-note"><strong>{OUTPUTS[output].label}</strong><p>The preview adapts to this target. Export uses a separate fixed-resolution render target, following the same pattern as Video Studio instead of scaling the browser preview.</p></div>
    </section>

    <div className="carousel-export-host" aria-hidden="true">{slides.map((slide, index) => {
      const key = `${draftKey}:${slide.id}`;
      const layout = layoutOverrides[key] ?? DEFAULT_LAYOUT;
      return <div key={slide.id} className={`carousel-export-artboard is-${style} is-${slide.kind} is-hint-${slide.templateHint} ${format.width > format.height ? "is-landscape" : format.height / format.width > 1.55 ? "is-vertical" : "is-portrait"}`} style={{ width: format.width, height: format.height }} ref={(node) => { exportRefs.current[slide.id] = node; }}><CarouselArtwork slide={slide} index={index} total={slides.length} grain={grain} layout={layout}/></div>;
    })}</div>

    <div className="carousel-print-sheet">{slides.map((slide, index) => { const key = `${draftKey}:${slide.id}`; return <div key={slide.id} className={`carousel-print-artboard is-${style} is-${slide.kind} is-hint-${slide.templateHint}`}><CarouselArtwork slide={slide} index={index} total={slides.length} grain={grain} layout={layoutOverrides[key] ?? DEFAULT_LAYOUT}/></div>; })}</div>
  </div>;
}

function CarouselArtwork({ slide, index, total, grain, layout }: { slide: CarouselSlide; index: number; total: number; grain: number; layout: LayoutState }) {
  const style = {
    "--carousel-grain": grain / 100,
    "--copy-y": `${layout.copyY}%`,
    "--headline-scale": layout.headlineScale,
    "--body-scale": layout.bodyScale,
    "--body-width": `${layout.bodyWidth}%`,
    "--crown-scale": layout.crownScale,
    "--slash-y": `${layout.slashY}%`,
    "--slash-width": `${layout.slashWidth}%`,
    "--title-width": `${layout.titleWidth}%`,
    "--copy-align": layout.align
  } as React.CSSProperties;

  return <div className="carousel-artwork" style={style}>
    <div className="carousel-ambient carousel-ambient-red"/>
    <div className="carousel-ambient carousel-ambient-blue"/>
    <div className="carousel-grain"/>
    <div className="carousel-city"/>
    <div className="carousel-slash"/>
    <img className="carousel-brand-mark" src="/brand/apostolic-guide-mark-reversed.png" alt=""/>
    <div className="carousel-pathway-label">SCRIPTURE PATHWAY</div>
    {slide.kind === "connection" || slide.templateHint === "verse-connection" ? <VerseConnection slide={slide}/> : <div className="carousel-copy">
      <span>{slide.eyebrow}</span>
      {slide.kind === "cover" || slide.templateHint === "manifesto" ? <Crown/> : null}
      <strong className={fitClass(slide.title)}>{slide.title}</strong>
      {slide.body ? <p>{slide.body}</p> : null}
      {slide.reference ? <em>{slide.reference}</em> : null}
    </div>}
    <div className="carousel-footer"><span>APOSTOLICGUIDE.COM</span><span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div>
  </div>;
}

function VerseConnection({ slide }: { slide: CarouselSlide }) {
  const first = slide.reference || slide.title;
  const second = slide.secondaryReference || "RELATED PASSAGE";
  return <div className="carousel-connection-copy">
    <span>{slide.eyebrow || "VERSE CONNECTION"}</span>
    <div className="connection-reference"><strong>{first}</strong></div>
    <i>↓</i>
    <div className="connection-reference"><strong>{second}</strong></div>
    {slide.body ? <p>{slide.body}</p> : null}
  </div>;
}

function Crown() {
  return <svg className="carousel-crown" viewBox="0 0 240 130" aria-hidden="true"><path d="M30 102 L22 34 L76 76 L120 18 L163 75 L218 34 L207 103 Z"/><path d="M28 108 C75 98 162 98 210 108"/><circle cx="21" cy="29" r="7"/><circle cx="120" cy="12" r="7"/><circle cx="220" cy="29" r="7"/><path className="carousel-crown-red" d="M40 118 C86 111 158 111 202 118"/></svg>;
}
