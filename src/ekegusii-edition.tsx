"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ChevronRight, Download, ExternalLink, FileUp, Languages, PencilLine, ShieldCheck } from "lucide-react";
import { displayEkegusiiBibleReference, ekegusiiBibleReference } from "@/ekegusii-bible-references";
import { verifiedEkegusiiExcerpt, reviewWarnings, rebaseReviewerDrafts } from "@/ekegusii-language-audit";

export type EkegusiiStudy = {
  slug: string;
  title: string;
  summary: string;
  collection: string;
  level: string;
  estimatedMinutes: number;
  steps: { title: string; reference: string; explanation: string; hook?: string }[];
};
export type EkegusiiListing = Omit<EkegusiiStudy, "steps"> & { stepCount: number; translatedTitle: string; translatedSummary: string };

export type EkegusiiDraft = {
  title?: string;
  summary?: string;
  steps?: Record<string, { title?: string; explanation?: string; hook?: string }>;
};
export type EkegusiiDrafts = Record<string, EkegusiiDraft>;
export const EKEGUSII_DRAFT_KEY = "apostolic-guide:ekegusii:review-v2";
const LEGACY_DRAFT_KEY = "apostolic-guide:ekegusii:review-v1";
const VERSION = 2;

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
      const current = window.localStorage.getItem(EKEGUSII_DRAFT_KEY);
      const legacy = current ? null : window.localStorage.getItem(LEGACY_DRAFT_KEY);
      if (current) setDrafts(safeDrafts(JSON.parse(current)));
      else if (legacy) setDrafts(rebaseReviewerDrafts(safeDrafts(JSON.parse(legacy))));
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
  const mergeAIDraft = useCallback((slug: string, incoming: EkegusiiDraft) => {
    setDrafts((current) => {
      const old = current[slug] ?? {};
      const steps = { ...(old.steps ?? {}) };
      for (const [index, proposed] of Object.entries(incoming.steps ?? {})) {
        const existing = steps[index] ?? {};
        steps[index] = {
          title: existing.title?.trim() ? existing.title : proposed.title,
          explanation: existing.explanation?.trim() ? existing.explanation : proposed.explanation,
          hook: existing.hook?.trim() ? existing.hook : proposed.hook,
        };
      }
      return { ...current, [slug]: {
        ...old,
        title: old.title?.trim() ? old.title : incoming.title,
        summary: old.summary?.trim() ? old.summary : incoming.summary,
        steps,
      } };
    });
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
      if (record.format !== "apostolic-guide-ekegusii-review" || ![1, VERSION].includes(Number(record.version)) || record.language !== "guz")
        throw Error("Wrong file format or version");
      if (!record.drafts || typeof record.drafts !== "object" || Array.isArray(record.drafts)) throw Error("Missing review entries");
      const imported = safeDrafts(record.drafts);
      setDrafts(record.version === 1 ? rebaseReviewerDrafts(imported) : imported);
      setMessage("Drafts imported in this browser. These changes are not published.");
    } catch { setMessage("Could not import the review file. Your current draft was kept."); }
  }, []);
  return { drafts, ready, message, setMessage, updateField, updateStep, mergeAIDraft, exportDrafts, importDrafts };
}

function Header({ onExport, onImport, showTools = false }: { onExport: () => void; onImport: (file?: File) => void; showTools?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <header className="eg-nav">
    <Link href="/ekegusii" className="eg-brand"><span className="eg-brand-mark">AG</span><span><strong>APOSTOLIC GUIDE</strong><small>EKEGUSII EDITION</small></span></Link>
    <nav aria-label="Ekegusii edition">
      <Link href="/ekegusii">20 Pathways</Link>
      <Link href="/ekegusii/bible">Ebibilia Enchenu <BookOpen size={13}/></Link>
    </nav>
    {showTools && <div className="eg-nav-actions">
      <input ref={input} className="eg-visually-hidden" type="file" accept=".json,application/json" aria-label="Import Ekegusii review JSON" onChange={(event) => { onImport(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      <button type="button" className="eg-icon-button" onClick={() => input.current?.click()} title="Import review file"><FileUp size={17}/><span>Import</span></button>
      <button type="button" className="eg-button eg-button-dark" onClick={onExport}><Download size={17}/> Export review</button>
    </div>}
  </header>;
}
function Footer() {
  return <footer className="eg-footer">
    <div><strong>APOSTOLIC GUIDE / EKEGUSII</strong><p>Scripture first. Faithful translation before public teaching.</p></div>
    <span>Draft translation · Native-speaker review pending</span>
    <Link href="/">Main Apostolic Guide <ArrowRight size={14}/></Link>
  </footer>;
}
function Note({ message }: { message: string }) {
  return message ? <p role="status" className="eg-note">{message}</p> : null;
}
function Frame({ children, onExport, onImport, message, showTools = false }: { children: React.ReactNode; onExport: () => void; onImport: (file?: File) => void; message: string; showTools?: boolean }) {
  return <div className="eg-shell"><Header onExport={onExport} onImport={onImport} showTools={showTools} /><Note message={message}/>{children}<Footer/></div>;
}

export function EkegusiiCatalog({ pathways }: { pathways: EkegusiiListing[] }) {
  const { drafts, message, exportDrafts, importDrafts } = useReviewDrafts();
  const total = pathways.reduce((sum, pathway) => sum + pathway.stepCount, 0);
  const categories = [...new Set(pathways.map((pathway) => pathway.collection))];
  return <Frame onExport={exportDrafts} onImport={importDrafts} message={message}>
    <section className="eg-hero">
      <div className="eg-hero-inner">
        <div className="eg-eyebrow"><span className="eg-line"/> EKEGUSII · APOSTOLIC GUIDE</div>
        <h1>Amang’ana a Nyasae.<br/><em>Ekegusii.</em></h1>
        <p className="eg-lead">20 Pathways · 106 Scripture steps · Ebibilia Enchenu</p>
        <div className="eg-hero-actions">
          <Link className="eg-button eg-button-light" lang="guz" href="/ekegusii/pathways/god-is-one">{pathways.find((item) => item.slug === "god-is-one")?.translatedTitle ?? "God Is One"} <ArrowRight size={17}/></Link>
          <span><ShieldCheck size={16}/> Draft translation</span>
        </div>
        <div className="eg-hero-stats"><div><strong>20</strong><span>Pathways</span></div><div><strong>{total}</strong><span>References</span></div><div><strong>20</strong><span>Ekegusii</span></div></div>
      </div>
      <div className="eg-hero-art" aria-hidden="true"><div className="eg-hero-orbit"><span>01</span><BookOpen size={83} strokeWidth={0.75}/><span>20</span></div><p>AMANG’ANA<br/>A NYASAE<br/>EKEGUSII</p></div>
    </section>
    <div className="eg-banner"><Languages size={19}/><p><strong>Draft translation.</strong> All 20 Ekegusii studies are ready to read, but their language and doctrinal wording are pending native-speaker review. Corrections can be submitted inside each lesson.</p></div>
    <section className="eg-index" aria-label="20 Bible study pathways">
      <div className="eg-section-heading"><span>EKEGUSII · 20 PATHWAYS</span><h2 lang="guz">Amang’ana a Nyasae.</h2><p>Ebibilia Enchenu · 106</p></div>
      {categories.map((category, categoryIndex) => <div className="eg-category" key={category}>
        <div className="eg-category-heading"><span>0{categoryIndex + 1}</span><h3 lang="guz">{pathways.find((item) => item.collection === category)?.translatedTitle || category}</h3></div>
        <div className="eg-study-grid">{pathways.filter((pathway) => pathway.collection === category).map((pathway) => {
          return <Link className="eg-study-card" href={"/ekegusii/pathways/" + pathway.slug} key={pathway.slug}>
            <div className="eg-card-top"><BookOpen size={20}/><span>Draft translation</span></div>
            <h4 lang="guz">{drafts[pathway.slug]?.title?.trim() || pathway.translatedTitle}</h4><p lang="guz">{drafts[pathway.slug]?.summary?.trim() || pathway.translatedSummary}</p>
            <div className="eg-card-bottom"><span>{pathway.estimatedMinutes} min · {pathway.stepCount}</span><span className="eg-card-open"><ArrowRight size={19}/></span></div>
          </Link>;
        })}</div>
      </div>)}
    </section>
  </Frame>;
}
export function EkegusiiReader({ pathway, index, total, seed, nextPathway }: { pathway: EkegusiiStudy; index: number; total: number; seed: EkegusiiDraft; nextPathway?: { slug: string; title: string } }) {
  const { drafts, ready, message, updateField, updateStep, mergeAIDraft, exportDrafts, importDrafts } = useReviewDrafts();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const lessonRef = useRef<HTMLElement>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewerLocation, setReviewerLocation] = useState("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");
  useEffect(() => {
    if (ready) mergeAIDraft(pathway.slug, seed);
  }, [ready, pathway.slug, seed, mergeAIDraft]);
  useEffect(() => {
    const syncHash = () => {
      const match = window.location.hash.match(/^#step-(\d+)$/);
      if (!match) return;
      const index = Number(match[1]) - 1;
      if (Number.isInteger(index) && index >= 0 && index < pathway.steps.length) setStep(index);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [pathway.slug, pathway.steps.length]);
  const selectStep = useCallback((index: number) => {
    const target = Math.max(0, Math.min(index, pathway.steps.length - 1));
    setStep(target);
    setSubmitState("idle");
    setSubmissionMessage("");
    window.history.replaceState(window.history.state, "", "#step-" + (target + 1));
    window.requestAnimationFrame(() => lessonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [pathway.steps.length]);
  const submitCorrection = useCallback(async () => {
    if (!reviewerName.trim() || !reviewerEmail.trim() || !reviewerLocation.trim()) {
      setSubmissionMessage("Enter your name, email, and location to send your correction."); setSubmitState("error"); return;
    }
    const edit = (drafts[pathway.slug]?.steps ?? {})[String(step)] ?? {};
    if (!edit.title?.trim() && !edit.explanation?.trim() && !edit.hook?.trim() && !reviewerNotes.trim()) {
      setSubmissionMessage("Add a corrected translation or a review note before submitting."); setSubmitState("error"); return;
    }
    const details = [
      "EKEGUSII PATHWAY REVIEW",
      "Pathway: " + pathway.title + " (" + pathway.slug + ")",
      "Step: " + (step + 1) + " of " + pathway.steps.length,
      "Reference: " + pathway.steps[step].reference,
      "Original English: " + pathway.steps[step].explanation,
      "Proposed Ekegusii title: " + (edit.title ?? ""),
      "Proposed Ekegusii explanation: " + (edit.explanation ?? ""),
      "Proposed Ekegusii transition: " + (edit.hook ?? ""),
      "Reviewer notes: " + reviewerNotes.trim(),
      "DO NOT AUTO-PUBLISH. Requires editorial and doctrinal approval.",
    ].join("\\n");
    if (details.length > 6000) {
      setSubmissionMessage("This correction is too long for one submission. Export your JSON file and contact the editorial team."); setSubmitState("error"); return;
    }
    setSubmitState("sending"); setSubmissionMessage("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reviewerName.trim(), email: reviewerEmail.trim(), location: reviewerLocation.trim(),
          category: "Content or source correction",
          context: "Ekegusii review: " + pathway.slug + " step " + (step + 1),
          question: details, path: "/ekegusii/pathways/" + pathway.slug,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw Error(data.message || "Submission failed");
      setSubmitState("sent");
      setSubmissionMessage("Correction received by Apostolic Guide. Reference: " + data.referenceId + ". It is pending editorial approval.");
      setReviewerNotes("");
    } catch (err) {
      setSubmitState("error");
      setSubmissionMessage(err instanceof Error ? err.message : "Could not submit correction.");
    }
  }, [reviewerName, reviewerEmail, reviewerLocation, reviewerNotes, drafts, pathway, step]);
  const draft = drafts[pathway.slug] ?? seed;
  const activeDraft = draft.steps?.[String(step)] ?? {};
  const original = pathway.steps[step];
  const next = Math.min(pathway.steps.length - 1, step + 1);
  const prev = Math.max(0, step - 1);
  const englishUrl = "/pathways/" + pathway.slug + "#step-" + (step + 1);
  const linkedBibleReference = ekegusiiBibleReference(original.reference);
  const excerpt = verifiedEkegusiiExcerpt(original.reference);
  const warnings = reviewWarnings(pathway.slug, step);
  return <Frame onExport={exportDrafts} onImport={importDrafts} message={message} showTools={mode === "edit"}>
    <section className="eg-reader-header">
      <Link className="eg-back" href="/ekegusii"><ArrowLeft size={16}/> All Pathways</Link>
      <div className="eg-reader-heading"><div><span className="eg-eyebrow">PATHWAY {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")} · Draft translation</span>
        <h1 lang={draft.title?.trim() ? "guz" : "en"}>{draft.title?.trim() || pathway.title}</h1>
        <p lang={draft.summary?.trim() ? "guz" : "en"}>{draft.summary?.trim() || pathway.summary}</p>
      </div><div className="eg-status"><BookOpen size={17}/> {pathway.steps.length} Scripture passages</div></div>
      <div className="eg-reader-controls">
        <div role="group" aria-label="Reading or translation correction mode" className="eg-toggle">
          <button type="button" className={mode === "read" ? "active" : ""} aria-pressed={mode === "read"} onClick={() => setMode("read")}><BookOpen size={15}/> Read teaching</button>
          <button type="button" className={mode === "edit" ? "active" : ""} aria-pressed={mode === "edit"} onClick={() => setMode("edit")}><PencilLine size={15}/> Suggest corrections</button>
        </div>
        <span>{mode === "read" ? "Draft translation · native review pending" : "Corrections save on this device and can be sent to Apostolic Guide."}</span>
      </div>
    </section>
    <section className="eg-reader-grid">
      <aside className="eg-step-nav" aria-label="Teaching steps">
        <div className="eg-step-nav-title"><strong>STUDY SEQUENCE</strong><span>{pathway.steps.length} passages</span></div>
        {pathway.steps.map((item, i) => <button type="button" key={item.reference} className={i === step ? "selected" : ""} aria-current={i === step ? "step" : undefined} onClick={() => selectStep(i)}>
          <span>{String(i + 1).padStart(2, "0")}</span><span>{draft.steps?.[String(i)]?.title?.trim() || item.title}<small>{displayEkegusiiBibleReference(item.reference)}</small></span>
          <span className={"eg-ref-status " + (verifiedEkegusiiExcerpt(item.reference) ? "eg-ref-checked" : "eg-ref-pending")} title={verifiedEkegusiiExcerpt(item.reference) ? "Bible wording compared. Teaching explanation still needs review." : "Bible wording and teaching require native-speaker review."}>{verifiedEkegusiiExcerpt(item.reference) ? "Bible text checked" : "Draft"}</span>
        </button>)}
        <Link href="/ekegusii/bible" className="eg-bible-link">Read Ekegusii Bible <BookOpen size={14}/></Link>
      </aside>
      <div className="eg-editor">
        {mode === "edit" && <div className="eg-intro-fields"><h2>Pathway details</h2><p>Keep the original theological meaning and references intact. Write a natural Ekegusii translation in the right-hand fields.</p>
          <div className="eg-pair"><div><span className="eg-field-label">ENGLISH TITLE · ORIGINAL</span><p className="eg-original">{pathway.title}</p></div><label><span className="eg-field-label">EKEGUSII TITLE · DRAFT</span><input value={draft.title ?? ""} onChange={(e) => updateField(pathway.slug, "title", e.target.value)} placeholder="Enter reviewed Ekegusii title"/></label></div>
          <div className="eg-pair"><div><span className="eg-field-label">ENGLISH SUMMARY · ORIGINAL</span><p className="eg-original">{pathway.summary}</p></div><label><span className="eg-field-label">EKEGUSII SUMMARY · DRAFT</span><textarea rows={3} value={draft.summary ?? ""} onChange={(e) => updateField(pathway.slug, "summary", e.target.value)} placeholder="Enter Ekegusii summary"/></label></div>
        </div>}
        <article className="eg-lesson" ref={lessonRef}>
          <div className="eg-progress-meter" role="progressbar" aria-label="Pathway progress" aria-valuemin={0} aria-valuemax={pathway.steps.length} aria-valuenow={step + 1}><span style={{ width: ((step + 1) / pathway.steps.length) * 100 + "%" }}/></div>
          <div className="eg-lesson-top"><span>STEP {String(step + 1).padStart(2, "0")} / {String(pathway.steps.length).padStart(2, "0")}</span>{linkedBibleReference ? <a href={linkedBibleReference.url} target="_blank" rel="noopener noreferrer" lang="guz" title={"Open " + linkedBibleReference.book + " chapter " + linkedBibleReference.chapter + " in the Ekegusii Bible"}>{linkedBibleReference.label} <ExternalLink size={13}/></a> : <span>{original.reference}</span>}</div>
          {mode === "read" ? <>
            <div className="eg-reading-content"><span className="eg-field-label">{activeDraft.title?.trim() && activeDraft.explanation?.trim() ? "EKEGUSII DRAFT · NOT YET APPROVED" : "ENGLISH SOURCE · TRANSLATION PENDING"}</span>
              <h2 lang={activeDraft.title?.trim() ? "guz" : "en"}>{activeDraft.title?.trim() || original.title}</h2>
              <p className="eg-scripture-ref"><BookOpen size={17}/> {linkedBibleReference ? <a lang="guz" href={linkedBibleReference.url} target="_blank" rel="noopener noreferrer" className="eg-scripture-chapter">{linkedBibleReference.label} <ExternalLink size={13}/></a> : <span>{original.reference}</span>} · <a href={englishUrl}>English source</a></p>
              {excerpt && <figure className="eg-bible-excerpt">
                <div className="eg-bible-quotation-label"><ShieldCheck size={15}/> Wording checked against Ebibilia Enchenu</div>
                <blockquote lang="guz">“{excerpt.text}”</blockquote>
                <figcaption>{excerpt.source}. <a href={linkedBibleReference?.url ?? "https://ebible.org/details.php?id=guz"} target="_blank" rel="noopener noreferrer">Read the full chapter <ExternalLink size={12}/></a></figcaption>
              </figure>}
              <h3>What this shows · Draft explanation</h3><p lang={activeDraft.explanation?.trim() ? "guz" : "en"}>{activeDraft.explanation?.trim() || original.explanation}</p>
              <div className="eg-transition"><span>CONTINUE THE STUDY</span><p lang={activeDraft.hook?.trim() ? "guz" : "en"}>{activeDraft.hook?.trim() || original.hook || ""}</p></div>
              <section className="eg-source-footnotes" aria-label="Scripture and editorial sources">
                <h3>Scripture and sources</h3>
                <p><strong>{linkedBibleReference?.label ?? original.reference}</strong> · <a href={linkedBibleReference?.url ?? "https://ebible.org/details.php?id=guz"} target="_blank" rel="noopener noreferrer">Ebibilia Enchenu <ExternalLink size={12}/></a> · © 2021 Bible Society of Kenya</p>
                <p>{excerpt ? "Bible wording compared; the teaching explanation still requires review." : "Bible wording not yet compared in this edition. Teaching explanation is a draft, not a Bible quotation."} The Scripture and theological interpretation are kept separate.</p>
                <details><summary>Compare with the approved English teaching</summary><p>{original.explanation}</p></details>
              </section>
              <button type="button" className="eg-inline-edit" onClick={() => setMode("edit")}><PencilLine size={15}/> Notice a translation issue? Suggest a correction</button>
            </div>
          </> : <>
            <h2>Translate this passage</h2><p className="eg-reference"><BookOpen size={18}/> {linkedBibleReference ? <a lang="guz" href={linkedBibleReference.url} target="_blank" rel="noopener noreferrer">{linkedBibleReference.label} <ExternalLink size={13}/></a> : original.reference} <a href={englishUrl} target="_blank" rel="noopener noreferrer">English source <ExternalLink size={13}/></a></p>
            {(["title", "explanation", "hook"] as const).map((field) => <div className="eg-pair eg-step-field" key={field}>
              <div><span className="eg-field-label">ENGLISH {field.toUpperCase()} · SOURCE</span><p className="eg-original">{original[field] ?? ""}</p></div>
              <label><span className="eg-field-label">EKEGUSII {field.toUpperCase()} · DRAFT</span>{field === "title" ?
                <input lang="guz" value={activeDraft[field] ?? ""} onChange={(event) => { updateStep(pathway.slug, step, field, event.target.value); setSubmitState("idle"); setSubmissionMessage(""); }} placeholder="Enter Ekegusii title"/> :
                <textarea lang="guz" rows={field === "explanation" ? 8 : 5} value={activeDraft[field] ?? ""} onChange={(event) => { updateStep(pathway.slug, step, field, event.target.value); setSubmitState("idle"); setSubmissionMessage(""); }} placeholder={"Enter Ekegusii " + field}/>}</label>
            </div>)}
            {warnings.length > 0 && <div className="eg-review-flags"><strong>Priority translation review</strong>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
            <div className="eg-reference-check">
              <strong>Bible language check</strong>
              <p>{excerpt ? "A short, checked Ekegusii Scripture excerpt is shown in reading mode." : "The linked Scripture is the wording source; its exact Ekegusii verse text has not yet been reviewed here."}</p>
              <a href={linkedBibleReference?.url ?? "https://ebible.org/details.php?id=guz"} target="_blank" rel="noopener noreferrer">Compare {linkedBibleReference?.label ?? original.reference} in Ebibilia Enchenu <ExternalLink size={14}/></a>
              <p>Doctrinal standard: preserve the full claim and qualifications of the English explanation displayed above. Do not treat an interpretation as a direct Bible quotation.</p>
            </div>
            <p className="eg-review-reminder"><ShieldCheck size={15}/> Confirm meaning, doctrinal accuracy, natural Ekegusii grammar, and Scripture wording. Bible references cannot be edited here.</p>
          </>}
          {mode === "edit" && <div className="eg-submit-panel">
            <div><span className="eg-field-label">SEND YOUR CORRECTION TO APOSTOLIC GUIDE</span>
              <h3>Submit this step for editorial review</h3>
              <p>Make your changes above, then submit this passage. The team receives it in the Apostolic Guide inbox. Nothing updates publicly until approved.</p>
            </div>
            <div className="eg-submit-grid">
              <label>Reviewer name<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Full name" autoComplete="name" required/></label>
              <label>Email address<input value={reviewerEmail} onChange={(event) => setReviewerEmail(event.target.value)} placeholder="name@example.com" type="email" autoComplete="email" required/></label>
              <label>Country or location<input value={reviewerLocation} onChange={(event) => setReviewerLocation(event.target.value)} placeholder="e.g. Kisii, Kenya" autoComplete="address-level2" required/></label>
            </div>
            <label className="eg-note-label">Translation feedback or doctrinal notes<textarea value={reviewerNotes} onChange={(event) => { setReviewerNotes(event.target.value); setSubmitState("idle"); setSubmissionMessage(""); }} rows={3} placeholder="Which words or phrases should change? What is the most natural Ekegusii expression?"/></label>
            <div className="eg-submit-actions"><button type="button" disabled={submitState === "sending" || submitState === "sent"} onClick={() => void submitCorrection()} className="eg-button eg-button-dark">{submitState === "sending" ? "Submitting..." : "Submit correction"} <ArrowRight size={15}/></button>
              <span role="status">{submissionMessage}</span>
            </div>
          </div>}
          <div className="eg-lesson-bottom"><button type="button" onClick={() => selectStep(prev)} disabled={step === 0}><ChevronLeft size={17}/> Previous</button><span>{step + 1} of {pathway.steps.length}</span><button type="button" onClick={() => selectStep(next)} disabled={step === pathway.steps.length - 1}>Next passage <ChevronRight size={17}/></button></div>
        </article>
        {step === pathway.steps.length - 1 && nextPathway && <Link className="eg-next-pathway" href={"/ekegusii/pathways/" + nextPathway.slug}>
          <span>CONTINUE YOUR BIBLE STUDY</span><strong>{nextPathway.title}</strong><ArrowRight size={23}/>
        </Link>}
        {step === pathway.steps.length - 1 && !nextPathway && <div className="eg-final-pathway"><ShieldCheck size={23}/><strong>You reached the final Pathway.</strong><Link href="/ekegusii">Browse all studies <ArrowRight size={15}/></Link></div>}
        <div className="eg-reader-end"><p><strong>Translation notice:</strong> These Ekegusii lessons are AI-generated drafts, not yet approved by a native-speaking editor. Consult the licensed Ekegusii Bible for Scripture text. Corrections require approval before the shared teaching changes.</p>{mode === "edit" && <button type="button" className="eg-button eg-button-dark" onClick={exportDrafts}><Download size={16}/> Export review file</button>}</div>
      </div>
    </section>
  </Frame>;
}
