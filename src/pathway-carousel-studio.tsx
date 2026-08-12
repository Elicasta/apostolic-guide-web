"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Layers3, RefreshCw, Sparkles } from "lucide-react";
import { toPng } from "html-to-image";

type StudioPathway = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  steps: { title: string; reference: string; explanation: string }[];
};

type CarouselSlide = {
  id: string;
  kind: "cover" | "scripture" | "statement" | "cta";
  eyebrow: string;
  title: string;
  body: string;
  reference: string;
};

type VisualStyle = "street" | "editorial" | "cinematic";

function buildSlides(pathway: StudioPathway): CarouselSlide[] {
  const scriptureSlides = pathway.steps.slice(0, 5).map((step, index) => ({
    id: String(index + 2).padStart(2, "0"),
    kind: index % 2 === 0 ? "scripture" as const : "statement" as const,
    eyebrow: step.title.toUpperCase(),
    title: step.explanation.replace(/[.!?].*$/, "").toUpperCase(),
    body: step.explanation,
    reference: step.reference.toUpperCase()
  }));

  return [
    {
      id: "01",
      kind: "cover",
      eyebrow: "APOSTOLIC GUIDE · PATHWAY",
      title: pathway.title.toUpperCase(),
      body: pathway.summary,
      reference: ""
    },
    ...scriptureSlides,
    {
      id: String(scriptureSlides.length + 2).padStart(2, "0"),
      kind: "statement",
      eyebrow: "THE THREAD",
      title: pathway.title.toUpperCase(),
      body: pathway.summary,
      reference: "SCRIPTURE IN CONTEXT"
    },
    {
      id: String(scriptureSlides.length + 3).padStart(2, "0"),
      kind: "cta",
      eyebrow: "KEEP STUDYING",
      title: `FOLLOW THE ${pathway.title.toUpperCase()} PATHWAY`,
      body: "Read every passage in sequence, see the connections, and continue the study on Apostolic Guide.",
      reference: "APOSTOLICGUIDE.COM"
    }
  ];
}

export function PathwayCarouselStudio({ pathways }: { pathways: StudioPathway[] }) {
  const initialSlug = pathways.find((pathway) => pathway.slug === "jesus-is-god")?.slug ?? pathways[0]?.slug ?? "";
  const [selectedSlug, setSelectedSlug] = useState(initialSlug);
  const selected = pathways.find((pathway) => pathway.slug === selectedSlug) ?? pathways[0];
  const generated = useMemo(() => selected ? buildSlides(selected) : [], [selected]);
  const [overrides, setOverrides] = useState<Record<string, Partial<CarouselSlide>>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [style, setStyle] = useState<VisualStyle>("street");
  const [grain, setGrain] = useState(62);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const exportRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const slides = useMemo(() => generated.map((slide) => ({ ...slide, ...(overrides[`${selectedSlug}:${slide.id}`] ?? {}) })), [generated, overrides, selectedSlug]);
  const active = slides[Math.min(activeIndex, Math.max(0, slides.length - 1))];

  if (!selected || !active) return <div className="studio-empty-state"><strong>No Pathways are available.</strong></div>;

  function updateActive(patch: Partial<CarouselSlide>) {
    const key = `${selectedSlug}:${active.id}`;
    setOverrides((current) => ({ ...current, [key]: { ...(current[key] ?? {}), ...patch } }));
  }

  function changePathway(slug: string) {
    setSelectedSlug(slug);
    setActiveIndex(0);
  }

  async function downloadNode(node: HTMLDivElement, filename: string) {
    const dataUrl = await toPng(node, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: true });
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  async function exportCurrent() {
    if (busy) return;
    const node = exportRefs.current[active.id];
    if (!node) return;
    setBusy(true);
    try { await downloadNode(node, `${selected.slug}-${active.id}.png`); }
    finally { setBusy(false); }
  }

  async function exportAll() {
    if (busy) return;
    setBusy(true);
    try {
      for (const slide of slides) {
        const node = exportRefs.current[slide.id];
        if (!node) continue;
        await downloadNode(node, `${selected.slug}-${slide.id}.png`);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } finally { setBusy(false); }
  }

  function remix() {
    setGrain((value) => value >= 76 ? 44 : value + 8);
  }

  return <div className="carousel-studio-page">
    <div className="studio-page-heading carousel-studio-heading">
      <div>
        <span className="eyebrow">Publishing · Lab</span>
        <h1>Carousel Studio</h1>
        <p className="admin-lede">Build branded 4:5 image carousels from the live Pathway catalog. The browser preview is the working composition. A separate fixed 1080 × 1350 render target is used only for export.</p>
      </div>
      <div className="carousel-heading-actions">
        <button type="button" className="button" onClick={exportCurrent} disabled={busy}><Download size={16}/> Export slide</button>
        <button type="button" className="button primary" onClick={exportAll} disabled={busy}><Layers3 size={16}/> {busy ? "Rendering…" : "Export carousel"}</button>
      </div>
    </div>

    <section className="carousel-sourcebar admin-card">
      <label><span>Pathway source</span><select value={selected.slug} onChange={(event) => changePathway(event.target.value)}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
      <div className="carousel-source-status"><span className="status-dot is-ready"/><div><strong>{slides.length} slides planned</strong><small>{selected.steps.length} live Scripture stops</small></div></div>
      <div className="carousel-source-status"><span className="status-dot is-ready"/><div><strong>4:5 Instagram</strong><small>1080 × 1350 final export</small></div></div>
      <div className="carousel-source-status"><span className="status-dot is-ready"/><div><strong>{selected.collection}</strong><small>Using live Pathway content</small></div></div>
    </section>

    <div className="carousel-studio-grid">
      <section className="admin-card carousel-preview-card">
        <div className="carousel-card-heading"><div><span className="section-kicker">Master-template preview</span><h2>{selected.title}</h2></div><span>1080 × 1350</span></div>

        <div className="carousel-preview-stage">
          <div className={`carousel-artboard is-${style} is-${active.kind}`} ref={previewRef} style={{ "--carousel-grain": grain / 100 } as React.CSSProperties}>
            <CarouselArtwork slide={active} index={activeIndex} total={slides.length}/>
          </div>
        </div>

        <div className="carousel-preview-nav">
          <button type="button" aria-label="Previous slide" onClick={() => setActiveIndex((activeIndex - 1 + slides.length) % slides.length)}><ChevronLeft size={20}/></button>
          <strong>{active.id} / {String(slides.length).padStart(2, "0")}</strong>
          <button type="button" aria-label="Next slide" onClick={() => setActiveIndex((activeIndex + 1) % slides.length)}><ChevronRight size={20}/></button>
        </div>

        <div className="carousel-style-tabs">
          {(["street", "editorial", "cinematic"] as VisualStyle[]).map((key) => <button type="button" key={key} className={style === key ? "is-active" : ""} onClick={() => setStyle(key)}><strong>{key === "street" ? "Street Theology" : key === "editorial" ? "Sacred Editorial" : "Cinematic"}</strong><span>{key === "street" ? "Paint, texture, hard type" : key === "editorial" ? "Paper, serif, annotation" : "Dark, restrained, image-led"}</span></button>)}
        </div>
      </section>

      <section className="admin-card carousel-editor-card">
        <div className="carousel-card-heading"><div><span className="section-kicker">Carousel sequence</span><h2>Slides</h2></div><button type="button" className="button small" onClick={remix}><RefreshCw size={15}/> Remix texture</button></div>
        <p className="carousel-editor-help">The Pathway builds the first draft. Editing here only changes this carousel draft. It does not change the live Pathway.</p>
        <div className="carousel-slide-list">{slides.map((slide, index) => <button type="button" key={slide.id} className={index === activeIndex ? "carousel-slide-row is-selected" : "carousel-slide-row"} onClick={() => setActiveIndex(index)}><span>{slide.id}</span><div><strong>{slide.title}</strong><small>{slide.kind} · {slide.reference || "cover"}</small></div></button>)}</div>

        <div className="carousel-fields">
          <label><span>Eyebrow</span><input value={active.eyebrow} onChange={(event) => updateActive({ eyebrow: event.target.value })}/></label>
          <label><span>Headline</span><textarea rows={3} value={active.title} onChange={(event) => updateActive({ title: event.target.value })}/></label>
          <label><span>Body</span><textarea rows={4} value={active.body} onChange={(event) => updateActive({ body: event.target.value })}/></label>
          <label><span>Reference</span><input value={active.reference} onChange={(event) => updateActive({ reference: event.target.value })}/></label>
        </div>
        <button type="button" className="button carousel-ai-placeholder"><Sparkles size={15}/> AI artwork layer comes after template approval</button>
      </section>
    </div>

    <section className="admin-card carousel-export-card">
      <div className="carousel-card-heading"><div><span className="section-kicker">Output</span><h2>Export-ready carousel</h2></div><span>Nothing publishes from here</span></div>
      <div className="carousel-export-strip">{slides.map((slide, index) => <button type="button" key={slide.id} onClick={() => setActiveIndex(index)} className={index === activeIndex ? "is-active" : ""}><span>{slide.id}</span><strong>{slide.title}</strong></button>)}</div>
      <div className="carousel-distribution-note"><strong>Lab isolation</strong><p>This route exists only on the carousel-studio-lab branch. It is not linked in Studio navigation and nothing has been merged into the live site.</p></div>
    </section>

    <div className="carousel-export-host" aria-hidden="true">{slides.map((slide, index) => <div key={slide.id} className={`carousel-export-artboard is-${style} is-${slide.kind}`} style={{ "--carousel-grain": grain / 100 } as React.CSSProperties} ref={(node) => { exportRefs.current[slide.id] = node; }}><CarouselArtwork slide={slide} index={index} total={slides.length}/></div>)}</div>
  </div>;
}

function CarouselArtwork({ slide, index, total }: { slide: CarouselSlide; index: number; total: number }) {
  return <>
    <div className="carousel-ambient carousel-ambient-red"/>
    <div className="carousel-ambient carousel-ambient-blue"/>
    <div className="carousel-grain"/>
    <div className="carousel-city"/>
    <div className="carousel-slash"/>
    <div className="carousel-brand"><strong>AG</strong><span>APOSTOLIC<br/>GUIDE</span></div>
    <div className="carousel-pathway-label">SCRIPTURE PATHWAY</div>
    <div className="carousel-copy">
      <span>{slide.eyebrow}</span>
      {slide.kind === "cover" ? <Crown/> : null}
      <strong>{slide.title}</strong>
      {slide.body ? <p>{slide.body}</p> : null}
      {slide.reference ? <em>{slide.reference}</em> : null}
    </div>
    <div className="carousel-footer"><span>APOSTOLICGUIDE.COM</span><span>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div>
  </>;
}

function Crown() {
  return <svg className="carousel-crown" viewBox="0 0 240 130" aria-hidden="true"><path d="M30 102 L22 34 L76 76 L120 18 L163 75 L218 34 L207 103 Z"/><path d="M28 108 C75 98 162 98 210 108"/><circle cx="21" cy="29" r="7"/><circle cx="120" cy="12" r="7"/><circle cx="220" cy="29" r="7"/></svg>;
}
