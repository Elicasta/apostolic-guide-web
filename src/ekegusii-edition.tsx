"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileUp, Languages, PencilLine, ShieldCheck } from "lucide-react";

export type EkegusiiStudy = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  level: string;
  estimatedMinutes: number;
  steps: { title: string; reference: string; explanation: string; hook: string }[];
};
export type EkegusiiListing = Omit<EkegusiiStudy, "steps"> & { stepCount: number };

export type EkegusiiDraft = {
  title?: string;
  summary?: string;
  steps?: Record<string, { title?: string; explanation?: string; hook?: string }>;
};
export type EkegusiiDrafts = Record<string, EkegusiiDraft>;
export const EKEGUSII_DRAFT_KEY = "apostolic-guide:ekegusii:review-v1";
const VERSION = 1;

export function safeDrafts(value: unknown): EkegusiiDrafts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: EkegusiiDrafts = {};
  for (const [slug, entry] of Object.entries(source).slice(0, 100)) {
    if (!/^[a-z0-9-]{1,90}$/.test(slug) || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const clean: EkegusiiDraft = {};
    if (typeof item.title === "string") clean.title = item.title.slice(0, 400);
    if (typeof item.summary === "string") clean.summary = item.summary.slice(0, 2400);
    if (item.steps && typeof item.steps === "object" && !Array.isArray(item.steps)) {
      clean.steps = {};
      for (const [index, raw] of Object.entries(item.steps).slice(0, 150)) {
        if (!/^\d{1,3}$/.test(index) || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
        const field = raw as Record<string, unknown>;
        clean.steps[index] = {};
        for (const key of ["title", "explanation", "hook"] as const) {
          if (typeof field[key] === "string") clean.steps[index][key] = field[key].slice(0, 6000);
        }
      }
    }
    result[slug] = clean;
  }
  return result;
}

export function filledStepCount(draft: EkegusiiDraft | undefined) {
  return Object.values(draft?.steps ?? {}).filter((step) =>
    Boolean(step.title?.trim() && step.explanation?.trim() && step.hook?.trim())
  ).length;
}
function useReviewDrafts() {
  const [drafts, setDrafts] = useState<EkegusiiDrafts>({});
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(EKEGUSII_DRAFT_KEY);
      if (saved) setDrafts(safeDrafts(JSON.parse(saved)));
    } catch { setMessage("Previous browser draft could not be read. No source teachings were changed."); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(EKEGUSII_DRAFT_KEY, JSON.stringify(drafts)); }
    catch { setMessage("Local storage is unavailable. Export your changes before leaving."); }
  }, [drafts, ready]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== EKEGUSII_DRAFT_KEY) return;
      try { setDrafts(safeDrafts(JSON.parse(event.newValue ?? "{}"))); } catch { /* Do not discard active drafts. */ }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const updateField = useCallback((slug: string, key: "title" | "summary", value: string) => {
    setDrafts((current) => ({ ...current, [slug]: { ...(current[slug] ?? {}), [key]: value } }));
  }, []);
  const updateStep = useCallback((slug: string, index: number, key: "title" | "explanation" | "hook", value: string) => {
    setDrafts((current) => {
      const draft = current[slug] ?? {};
      const steps = draft.steps ?? {};
      const step = steps[String(index)] ?? {};
      return { ...current, [slug]: { ...draft, steps: { ...steps, [String(index)]: { ...step, [key]: value } } } };
    });
  }, []);
  const exportDrafts = useCallback(() => {
    const payload = { format: "apostolic-guide-ekegusii-review", version: VERSION, language: "guz", exportedAt: new Date().toISOString(), drafts };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "apostolic-guide-ekegusii-review.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Review file exported. Send the JSON file to the Apostolic Guide editor for publication.");
  }, [drafts]);
  const importDrafts = useCallback(async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_500_000) { setMessage("File is too large. Maximum review file size is 1.5 MB."); return; }
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!data || typeof data !== "object") throw Error("Invalid file");
      const record = data as Record<string, unknown>;
      if (record.format !== "apostolic-guide-ekegusii-review" || record.version !== VERSION || record.language !== "guz")
        throw Error("Wrong file format or version");
      if (!record.drafts || typeof record.drafts !== "object" || Array.isArray(record.drafts)) throw Error("Missing review entries");
      setDrafts(safeDrafts(record.drafts));
      setMessage("Drafts imported in this browser. These changes are not published.");
    } catch { setMessage("Could not import the review file. Your current draft was kept."); }
  }, []);
  return { drafts, ready, message, setMessage, updateField, updateStep, exportDrafts, importDrafts };
}

function Header({ onExport, onImport }: { onExport: () => void; onImport: (file?: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return <header className="eg-nav">
    <Link href="/ekegusii" className="eg-brand"><span className="eg-brand-mark">AG</span><span><strong>APOSTOLIC GUIDE</strong><small>EKEGUSII EDITION</small></span></Link>
    <nav aria-label="Ekegusii edition">
      <Link href="/ekegusii">All 20 Pathways</Link>
      <a href="https://ebible.org/details.php?id=guz" target="_blank" rel="noopener noreferrer">Ekegusii Bible <ExternalLink size={13}/></a>
    </nav>
    <div className="eg-nav-actions">
      <input ref={input} className="eg-visually-hidden" type="file" accept=".json,application/json" aria-label="Import Ekegusii review JSON" onChange={(event) => { onImport(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      <button type="button" className="eg-icon-button" onClick={() => input.current?.click()} title="Import review file"><FileUp size={17}/><span>Import</span></button>
      <button type="button" className="eg-button eg-button-dark" onClick={onExport}><Download size={17}/> Export review</button>
    </div>
  </header>;
}
function Footer() {
  return <footer className="eg-footer">
    <div><strong>APOSTOLIC GUIDE / EKEGUSII</strong><p>Scripture first. Faithful translation before public teaching.</p></div>
    <span>Editorial review edition · Not approved Ekegusii Scripture or teaching</span>
    <Link href="/">Main Apostolic Guide <ArrowRight size={14}/></Link>
  </footer>;
}
function Note({ message }: { message: string }) {
  return message ? <p role="status" className="eg-note">{message}</p> : null;
}
function Frame({ children, onExport, onImport, message }: { children: React.ReactNode; onExport: () => void; onImport: (file?: File) => void; message: string }) {
  return <div className="eg-shell"><Header onExport={onExport} onImport={onImport} /><Note message={message}/>{children}<Footer/></div>;
}

export function EkegusiiCatalog({ pathways }: { pathways: EkegusiiListing[] }) {
  const { drafts, message, exportDrafts, importDrafts } = useReviewDrafts();
  const complete = pathways.reduce((total, pathway) => total + Math.min(pathway.stepCount, filledStepCount(drafts[pathway.slug])), 0);
  const total = pathways.reduce((sum, pathway) => sum + pathway.stepCount, 0);
  const categories = [...new Set(pathways.map((pathway) => pathway.collection))];
  return <Frame onExport={exportDrafts} onImport={importDrafts} message={message}>
    <section className="eg-hero">
      <div className="eg-hero-inner">
        <div className="eg-eyebrow"><span className="eg-line"/> SCRIPTURE · TEACHING · TRANSLATION</div>
        <h1>God’s Word.<br/><em>Every language.</em></h1>
        <p className="eg-lead">Ekegusii Bible study edition. Twenty connected studies built from the Apostolic Guide teaching catalog, presented for native-language review.</p>
        <div className="eg-hero-actions">
          <Link className="eg-button eg-button-light" href="/ekegusii/pathways/god-is-one">Begin with God Is One <ArrowRight size={17}/></Link>
          <span><ShieldCheck size={16}/> Translation review in progress</span>
        </div>
        <div className="eg-hero-stats"><div><strong>20</strong><span>Teaching pathways</span></div><div><strong>{total}</strong><span>Scripture steps</span></div><div><strong>{complete}</strong><span>Full draft steps in this browser</span></div></div>
      </div>
      <div className="eg-hero-art" aria-hidden="true"><div className="eg-hero-orbit"><span>01</span><BookOpen size={83} strokeWidth={0.75}/><span>20</span></div><p>THE WORD<br/>FOR EVERY<br/>TONGUE</p></div>
    </section>
    <div className="eg-banner"><Languages size={19}/><p><strong>Reviewer edition.</strong> English remains visible until a native speaker supplies Ekegusii text. Translations save to this browser, not the live teaching catalog. Export the review file to submit corrections.</p></div>
    <section className="eg-index" aria-label="20 Bible study pathways">
      <div className="eg-section-heading"><span>THE COMPLETE STUDY LIBRARY</span><h2>Follow the Scriptures.</h2><p>Four collections. Twenty Pathways. One connected study of Apostolic teaching.</p></div>
      {categories.map((category, categoryIndex) => <div className="eg-category" key={category}>
        <div className="eg-category-heading"><span>0{categoryIndex + 1}</span><h3>{category}</h3></div>
        <div className="eg-study-grid">{pathways.filter((pathway) => pathway.collection === category).map((pathway) => {
          const count = Math.min(pathway.stepCount, filledStepCount(drafts[pathway.slug]));
          const drafted = count > 0 || Boolean(drafts[pathway.slug]?.title?.trim());
          return <Link className="eg-study-card" href={"/ekegusii/pathways/" + pathway.slug} key={pathway.slug}>
            <div className="eg-card-top"><BookOpen size={20}/><span>{drafted ? count + "/" + pathway.stepCount + " steps drafted" : "Awaiting Ekegusii translation"}</span></div>
            <h4>{pathway.title}</h4><p>{pathway.summary}</p>
            <div className="eg-card-bottom"><span>{pathway.estimatedMinutes} MIN · {pathway.stepCount} STEPS</span><ArrowRight size={19}/></div>
          </Link>;
        })}</div>
      </div>)}
    </section>
  </Frame>;
}
export function EkegusiiReader({ pathway, index, total }: { pathway: EkegusiiStudy; index: number; total: number }) {
  const { drafts, message, updateField, updateStep, exportDrafts, importDrafts } = useReviewDrafts();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"read" | "edit">("edit");
  const draft = drafts[pathway.slug] ?? {};
  const activeDraft = draft.steps?.[String(step)] ?? {};
  const original = pathway.steps[step];
  const drafted = filledStepCount(draft);
  const next = Math.min(pathway.steps.length - 1, step + 1);
  const prev = Math.max(0, step - 1);
  const englishUrl = "/pathways/" + pathway.slug + "#step-" + (step + 1);
  return <Frame onExport={exportDrafts} onImport={importDrafts} message={message}>
    <section className="eg-reader-header">
      <Link className="eg-back" href="/ekegusii"><ArrowLeft size={16}/> All Pathways</Link>
      <div className="eg-reader-heading"><div><span className="eg-eyebrow">PATHWAY {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")} · {pathway.collection}</span>
        <h1 lang={draft.title?.trim() ? "guz" : "en"}>{draft.title?.trim() || pathway.title}</h1>
        <p lang={draft.summary?.trim() ? "guz" : "en"}>{draft.summary?.trim() || pathway.summary}</p>
      </div><div className="eg-status"><ShieldCheck size={17}/> {drafted} / {pathway.steps.length} draft steps</div></div>
      <div className="eg-reader-controls"><div role="group" aria-label="Reading or translation editing mode" className="eg-toggle"><button type="button" className={mode === "edit" ? "active" : ""} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}><PencilLine size={15}/> Review translation</button><button type="button" className={mode === "read" ? "active" : ""} aria-pressed={mode === "read"} onClick={() => setMode("read")}><BookOpen size={15}/> Reading preview</button></div><span>Drafts are saved on this device. Export to share edits.</span></div>
    </section>
    <section className="eg-reader-grid">
      <aside className="eg-step-nav" aria-label="Teaching steps">
        <div className="eg-step-nav-title"><strong>STUDY SEQUENCE</strong><span>{pathway.steps.length} passages</span></div>
        {pathway.steps.map((item, i) => <button type="button" key={item.reference} className={i === step ? "selected" : ""} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
          <span>{String(i + 1).padStart(2, "0")}</span><span>{draft.steps?.[String(i)]?.title?.trim() || item.title}<small>{item.reference}</small></span>
          {draft.steps?.[String(i)]?.explanation?.trim() && <Check size={14}/>}
        </button>)}
        <a href="https://ebible.org/details.php?id=guz" className="eg-bible-link" target="_blank" rel="noopener noreferrer">Consult Ekegusii Bible <ExternalLink size={14}/></a>
      </aside>
      <div className="eg-editor">
        {mode === "edit" && <div className="eg-intro-fields"><h2>Pathway details</h2><p>Keep the original theological meaning and references intact. Write a natural Ekegusii translation in the right-hand fields.</p>
          <div className="eg-pair"><div><span className="eg-field-label">ENGLISH TITLE · ORIGINAL</span><p className="eg-original">{pathway.title}</p></div><label><span className="eg-field-label">EKEGUSII TITLE · DRAFT</span><input value={draft.title ?? ""} onChange={(e) => updateField(pathway.slug, "title", e.target.value)} placeholder="Enter reviewed Ekegusii title"/></label></div>
          <div className="eg-pair"><div><span className="eg-field-label">ENGLISH SUMMARY · ORIGINAL</span><p className="eg-original">{pathway.summary}</p></div><label><span className="eg-field-label">EKEGUSII SUMMARY · DRAFT</span><textarea rows={3} value={draft.summary ?? ""} onChange={(e) => updateField(pathway.slug, "summary", e.target.value)} placeholder="Enter Ekegusii summary"/></label></div>
        </div>}
        <article className="eg-lesson">
          <div className="eg-lesson-top"><span>STEP {String(step + 1).padStart(2, "0")} / {String(pathway.steps.length).padStart(2, "0")}</span><span>{original.reference}</span></div>
          {mode === "read" ? <>
            <div className="eg-reading-content"><span className="eg-field-label">{activeDraft.title?.trim() && activeDraft.explanation?.trim() ? "EKEGUSII DRAFT · NOT YET APPROVED" : "ENGLISH SOURCE · TRANSLATION PENDING"}</span>
              <h2 lang={activeDraft.title?.trim() ? "guz" : "en"}>{activeDraft.title?.trim() || original.title}</h2>
              <p className="eg-scripture-ref"><BookOpen size={17}/> {original.reference} · <a href={englishUrl}>Read English KJV</a></p>
              <h3>What this shows</h3><p lang={activeDraft.explanation?.trim() ? "guz" : "en"}>{activeDraft.explanation?.trim() || original.explanation}</p>
              <div className="eg-transition"><span>CONTINUE THE STUDY</span><p lang={activeDraft.hook?.trim() ? "guz" : "en"}>{activeDraft.hook?.trim() || original.hook}</p></div>
            </div>
          </> : <>
            <h2>Translate this passage</h2><p className="eg-reference"><BookOpen size={18}/> {original.reference} <a href={englishUrl} target="_blank" rel="noopener noreferrer">English study <ExternalLink size={13}/></a></p>
            {(["title", "explanation", "hook"] as const).map((field) => <div className="eg-pair eg-step-field" key={field}>
              <div><span className="eg-field-label">ENGLISH {field.toUpperCase()} · SOURCE</span><p className="eg-original">{original[field]}</p></div>
              <label><span className="eg-field-label">EKEGUSII {field.toUpperCase()} · DRAFT</span>{field === "title" ?
                <input lang="guz" value={activeDraft[field] ?? ""} onChange={(event) => updateStep(pathway.slug, step, field, event.target.value)} placeholder="Enter Ekegusii title"/> :
                <textarea lang="guz" rows={field === "explanation" ? 8 : 5} value={activeDraft[field] ?? ""} onChange={(event) => updateStep(pathway.slug, step, field, event.target.value)} placeholder={"Enter Ekegusii " + field}/>}</label>
            </div>)}
            <p className="eg-review-reminder"><ShieldCheck size={15}/> Confirm meaning, doctrinal accuracy, tone, and natural Ekegusii grammar. The Scripture reference is intentionally locked.</p>
          </>}
          <div className="eg-lesson-bottom"><button type="button" onClick={() => setStep(prev)} disabled={step === 0}><ChevronLeft size={17}/> Previous</button><span>{step + 1} of {pathway.steps.length}</span><button type="button" onClick={() => setStep(next)} disabled={step === pathway.steps.length - 1}>Next passage <ChevronRight size={17}/></button></div>
        </article>
        <div className="eg-reader-end"><p><strong>No automatic public publishing.</strong> Review changes stay in your browser until exported and formally approved. Scripture quotations from the copyrighted Ekegusii Bible are not copied here.</p><button type="button" className="eg-button eg-button-dark" onClick={exportDrafts}><Download size={16}/> Export review file</button></div>
      </div>
    </section>
  </Frame>;
}
