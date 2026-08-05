"use client";

import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type SmartSuggestionCandidate = {
  href: string;
  title: string;
  description: string;
  kind: string;
  reason?: string;
  actionLabel?: string;
  priority?: number;
};

type ReadingHistoryItem = {
  ratio: number;
  completed: boolean;
  title: string;
  updatedAt: number;
};

type ReadingHistory = Record<string, ReadingHistoryItem>;

const HISTORY_KEY = "apostolic-guide:reading-history:v1";

function readHistory(): ReadingHistory {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? parsed as ReadingHistory : {};
  } catch {
    return {};
  }
}

function uniqueCandidates(currentPath: string, candidates: SmartSuggestionCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.href || candidate.href === currentPath || seen.has(candidate.href)) return false;
    seen.add(candidate.href);
    return true;
  });
}

function chooseCandidate(candidates: SmartSuggestionCandidate[], history: ReadingHistory) {
  return [...candidates]
    .map((candidate, index) => {
      const record = history[candidate.href];
      let score = (candidate.priority ?? 0) - index;
      if (!record) score += 40;
      else if (record.completed) score -= 90;
      else if (record.ratio >= 0.08) score -= 18;
      if (record) score -= Math.min(12, (Date.now() - record.updatedAt) / (1000 * 60 * 60 * 24 * 7));
      return { candidate, score, updatedAt: record?.updatedAt ?? 0 };
    })
    .sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt)[0]?.candidate;
}

export function SmartNext({
  currentPath,
  candidates,
  eyebrow = "Recommended next",
  heading = "Keep following the biblical case.",
  intro = "Apostolic Guide uses what you have already opened on this device to suggest a useful next step.",
  primaryLabel
}: {
  currentPath: string;
  candidates: SmartSuggestionCandidate[];
  eyebrow?: string;
  heading?: string;
  intro?: string;
  primaryLabel?: string;
}) {
  const available = useMemo(() => uniqueCandidates(currentPath, candidates), [candidates, currentPath]);
  const [selectedHref, setSelectedHref] = useState(available[0]?.href ?? "");

  useEffect(() => {
    if (!available.length) return;
    const selected = chooseCandidate(available, readHistory()) ?? available[0];
    setSelectedHref(selected.href);
  }, [available]);

  const selected = available.find((candidate) => candidate.href === selectedHref) ?? available[0];
  const secondary = available.filter((candidate) => candidate.href !== selected?.href).slice(0, 2);

  if (!selected) return null;

  return (
    <section className="smart-next" aria-labelledby={`smart-next-${currentPath.replace(/[^a-z0-9]/gi, "-")}`} data-reveal>
      <div className="smart-next-intro">
        <span className="smart-next-icon"><Compass size={19} aria-hidden /></span>
        <span className="eyebrow eyebrow-light">{eyebrow}</span>
        <h2 id={`smart-next-${currentPath.replace(/[^a-z0-9]/gi, "-")}`}>{heading}</h2>
        <p>{intro}</p>
      </div>

      <Link className="smart-next-primary" href={selected.href}>
        <span className="smart-next-kind">{selected.kind}</span>
        <h3>{selected.title}</h3>
        <p>{selected.description}</p>
        {selected.reason && <small>{selected.reason}</small>}
        <strong>{primaryLabel ?? selected.actionLabel ?? "Continue study"}<ArrowRight size={17} /></strong>
      </Link>

      {secondary.length > 0 && (
        <div className="smart-next-secondary" aria-label="More suggested studies">
          {secondary.map((candidate) => (
            <Link href={candidate.href} key={candidate.href}>
              <span><small>{candidate.kind}</small><strong>{candidate.title}</strong></span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
