"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, List, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BibleReferenceLink } from "./bible-links";
import styles from "./pathway-card-reader.module.css";

export type PathwayReaderStep = {
  title: string;
  reference: string;
  explanation: string;
  hook?: string;
  scriptureVerses?: Array<{ number: number; text: string }>;
  scripturePath?: string | null;
};

type PathwayCardReaderProps = {
  slug: string;
  title: string;
  steps: PathwayReaderStep[];
  nextPathway?: { title: string; href: string } | null;
};

const emphasisPhrases = [
  "fullness of the Godhead bodily",
  "none other God but one",
  "before me there was no God formed",
  "neither shall there be after me",
  "beside me there is no God",
  "I am the first, and I am the last",
  "he that hath seen me hath seen the Father",
  "the Father that dwelleth in me",
  "born of water and of the Spirit",
  "faith, if it hath not works, is dead",
  "faith which worketh by love",
  "speak with other tongues",
  "speaking with tongues",
  "spake with tongues",
  "the Word was made flesh",
  "the Word was God",
  "image of the invisible God",
  "the man Christ Jesus",
  "called the Son of God",
  "the everlasting Father",
  "the mighty God",
  "God with us",
  "God was in Christ",
  "My Lord and my God",
  "name of Jesus Christ",
  "name of the Lord Jesus",
  "baptized in the name",
  "gift of the Holy Ghost",
  "Holy Ghost",
  "born again",
  "saved through faith",
  "by grace",
  "obedience to the faith",
  "one Spirit",
  "one LORD",
  "one God",
  "there is none else",
  "there is no God",
  "by myself",
  "right hand",
  "be baptized",
  "Repent",
  "all in all"
].sort((a, b) => b.length - a.length);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

const emphasisPattern = new RegExp(
  `(${emphasisPhrases.map(escapeRegExp).join("|")})`,
  "gi"
);

function renderKjvText(text: string) {
  return text.split(emphasisPattern).map((part, index) => {
    if (!part) return null;
    const emphasized = emphasisPhrases.some((phrase) => phrase.toLowerCase() === part.toLowerCase());
    return emphasized
      ? <strong className={styles.emphasis} key={`${part}-${index}`}>{part}</strong>
      : part;
  });
}

function stepFromHash(stepCount: number) {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/^#step-(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < stepCount ? index : null;
}

export function PathwayCardReader({ slug, title, steps, nextPathway }: PathwayCardReaderProps) {
  const [active, setActive] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const storageKey = `apostolic-guide:pathway:${slug}:step`;

  const scrollReaderIntoPlace = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const reader = readerRef.current;
        if (!reader) return;
        const stickyHeader = document.querySelector<HTMLElement>(".site-header");
        const headerHeight = stickyHeader?.getBoundingClientRect().height ?? 0;
        const top = reader.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    });
  }, []);

  const setStep = useCallback((index: number, options: { push?: boolean; scroll?: boolean } = {}) => {
    const clamped = Math.max(0, Math.min(index, steps.length - 1));
    setActive(clamped);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(clamped));
      if (options.push !== false) {
        const url = `${window.location.pathname}${window.location.search}#step-${clamped + 1}`;
        window.history.pushState({ pathwayStep: clamped }, "", url);
      }
      if (options.scroll !== false) scrollReaderIntoPlace();
    }
  }, [scrollReaderIntoPlace, steps.length, storageKey]);

  useEffect(() => {
    const hashStep = stepFromHash(steps.length);
    if (hashStep !== null) {
      setActive(hashStep);
      window.localStorage.setItem(storageKey, String(hashStep));
      return;
    }

    const saved = Number(window.localStorage.getItem(storageKey));
    if (Number.isInteger(saved) && saved >= 0 && saved < steps.length) setActive(saved);
  }, [steps.length, storageKey]);

  useEffect(() => {
    const restoreFromUrl = () => {
      const hashStep = stepFromHash(steps.length);
      if (hashStep !== null) {
        setActive(hashStep);
        window.localStorage.setItem(storageKey, String(hashStep));
      }
    };

    window.addEventListener("popstate", restoreFromUrl);
    window.addEventListener("hashchange", restoreFromUrl);
    return () => {
      window.removeEventListener("popstate", restoreFromUrl);
      window.removeEventListener("hashchange", restoreFromUrl);
    };
  }, [steps.length, storageKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) return;

      if (event.key === "ArrowRight" && active < steps.length - 1) setStep(active + 1);
      if (event.key === "ArrowLeft" && active > 0) setStep(active - 1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, setStep, steps.length]);

  if (!steps.length) return null;

  const step = steps[active];
  const isFirst = active === 0;
  const isLast = active === steps.length - 1;
  const nextStep = !isLast ? steps[active + 1] : null;

  return (
    <div
      ref={readerRef}
      className={styles.reader}
      aria-label={`${title} guided pathway`}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        if (!start) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - start.x;
        const deltaY = touch.clientY - start.y;
        if (Math.abs(deltaX) < 55 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
        if (deltaX < 0 && !isLast) setStep(active + 1);
        if (deltaX > 0 && !isFirst) setStep(active - 1);
      }}
    >
      <article
        key={`${slug}-${active}`}
        id={`step-${active + 1}`}
        className={styles.card}
        data-pathway-step={active}
        data-pathway-reference={step.reference}
        aria-live="polite"
      >
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.arrowButton}
            onClick={() => setStep(active - 1)}
            disabled={isFirst}
            aria-label="Previous study step"
          >
            <ArrowLeft size={19} />
          </button>

          <div className={styles.progressBlock}>
            <span className={styles.progressLabel}>Step {String(active + 1).padStart(2, "0")} of {String(steps.length).padStart(2, "0")}</span>
            <div className={styles.dots} aria-hidden="true">
              {steps.map((item, index) => (
                <span key={`${item.reference}-${index}`} className={index === active ? styles.dotActive : styles.dot} />
              ))}
            </div>
          </div>

          <button
            type="button"
            className={styles.arrowButton}
            onClick={() => setStep(active + 1)}
            disabled={isLast}
            aria-label="Next study step"
          >
            <ArrowRight size={19} />
          </button>
        </div>

        <header className={styles.cardHeader}>
          <span className={styles.reference}>{step.reference}</span>
          <span className={styles.stepNumber}>{String(active + 1).padStart(2, "0")}</span>
        </header>

        <h2>{step.title}</h2>

        {step.scriptureVerses?.length ? (
          <blockquote className={styles.verse}>
            <div className={styles.verseHeading}>
              <span>King James Version</span>
              <small>Full passage</small>
            </div>
            <div className={styles.verseBody}>
              {step.scriptureVerses.map((verse) => (
                <p key={verse.number}>
                  <sup>{verse.number}</sup>
                  <span>{renderKjvText(verse.text)}</span>
                </p>
              ))}
            </div>
          </blockquote>
        ) : null}

        <div className={styles.explanation}>
          <span>What this shows</span>
          <p>{step.explanation}</p>
        </div>

        <div className={styles.studyActions}>
          {step.scripturePath ? (
            <Link className={styles.studyLink} href={`/scripture/${step.scripturePath}`}>
              <BookOpen size={16} /> Study passage
            </Link>
          ) : null}
          <BibleReferenceLink reference={step.reference} />
        </div>

        {step.hook ? (
          <div className={styles.hook}>
            <span>{isLast ? "Where this leads" : "Next question"}</span>
            <p>{step.hook}</p>
          </div>
        ) : nextStep ? (
          <div className={styles.hook}>
            <span>Next question</span>
            <p>{nextStep.reference} takes the next step in the study: {nextStep.title}.</p>
          </div>
        ) : null}

        <footer className={styles.cardFooter}>
          <button
            type="button"
            className={styles.previousButton}
            onClick={() => setStep(active - 1)}
            disabled={isFirst}
          >
            <ArrowLeft size={17} /> Previous
          </button>

          {!isLast && nextStep ? (
            <button type="button" className={styles.nextButton} onClick={() => setStep(active + 1)}>
              <span><small>Next</small>{nextStep.reference}</span>
              <ArrowRight size={18} />
            </button>
          ) : nextPathway ? (
            <Link className={styles.nextButton} href={nextPathway.href}>
              <span><small>Continue pathway</small>{nextPathway.title}</span>
              <ArrowRight size={18} />
            </Link>
          ) : (
            <div className={styles.complete}>
              <Check size={17} /> Pathway complete
            </div>
          )}
        </footer>
      </article>

      <div className={styles.readerUtility}>
        <button type="button" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
          {showAll ? <X size={16} /> : <List size={16} />}
          {showAll ? "Close overview" : "View all steps"}
        </button>
        <span>Swipe or use ← →</span>
      </div>

      {showAll ? (
        <nav className={styles.overview} aria-label="Pathway step overview">
          {steps.map((item, index) => (
            <button
              type="button"
              key={`${item.reference}-overview-${index}`}
              className={index === active ? styles.overviewActive : styles.overviewItem}
              onClick={() => {
                setShowAll(false);
                setStep(index);
              }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <span><small>{item.reference}</small><strong>{item.title}</strong></span>
              <ArrowRight size={15} />
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
