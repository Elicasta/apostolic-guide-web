import type { DoctrineEpisode } from "./types";

const LINE_WIDTH = 38;

/**
 * Isaiah 9:6 is copied from the episode list, which quotes bible-api.com KJV
 * "Counsellor". The pathway passage in src/pathway-kjv-old-testament.ts and the
 * corpus in src/scripture-data/kjv.json both store "Counseller". Leave the
 * script spelling alone; do not normalize it to the corpus.
 */
function emphasize(value: string) {
  return value.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "**$1**");
}

function wrapBlock(value: string, width = LINE_WIDTH) {
  // Keep **emphasis** on one line so the teleprompter bold markup is not split.
  const words = value.match(/\*\*[^*]+\*\*\S*|\S+/g) ?? [];
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }

  if (current) lines.push(current);
  return lines.join("\n");
}

function wrapSpoken(value: string) {
  const normalized = emphasize(value).replace(/\s+/g, " ").trim();
  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z"'“(])/);
  return sentences.map((sentence) => wrapBlock(sentence)).join("\n\n");
}

function spokenQuote(value: string) {
  const trimmed = value.trim();
  const inner =
    trimmed.startsWith("\"") && trimmed.endsWith("\"") && trimmed.length > 1
      ? trimmed.slice(1, -1)
      : trimmed;
  const lines = wrapBlock(emphasize(inner)).split("\n").filter(Boolean);
  if (lines.length === 0) return "\"\"";
  if (lines.length === 1) return `"${lines[0]}"`;
  return [`"${lines[0]}`, ...lines.slice(1, -1), `${lines[lines.length - 1]}"`].join("\n");
}

function verseNote(text: string) {
  const spelling = text.includes("Counsellor") ? " Keep the spelling Counsellor." : "";
  return `@note Read the King James text as written. Do not shorten or modernize it.${spelling}`;
}

export function buildDoctrineScript(episode: DoctrineEpisode) {
  const titleSentence = /[.!?]$/.test(episode.title) ? episode.title : `${episode.title}.`;
  const hookNote = [
    `Title: ${titleSentence}`,
    episode.format.endsWith(".") ? episode.format : `${episode.format}.`,
    "Read the title aloud as the hook.",
    "Welcome the question. Do not mock the person who asks it.",
    episode.recordingNote,
  ]
    .filter(Boolean)
    .join(" ");

  const sections = [
    [`# ${episode.title}`, `@ref Batch ${episode.batch} · ${episode.batchLabel}`, `@note ${hookNote}`].join(
      "\n",
    ),
    [`# The Claim`, "", wrapSpoken(episode.claim), "@note State the claim, then read the anchor verses."].join(
      "\n",
    ),
    ...episode.verses.map((verse) =>
      [`# ${verse.reference}`, "", `> ${verse.text}`, verseNote(verse.text)].join("\n"),
    ),
    [
      "# The Objection",
      "",
      "Often stated.",
      "",
      spokenQuote(episode.objection),
      "@note Quote the objection fairly. This is the objection, not the teaching.",
    ].join("\n"),
    [
      "# The Answer",
      "",
      wrapSpoken(episode.answer),
      "@note Answer from the passages just read. Do not add a new claim.",
    ].join("\n"),
    [
      "# Close",
      "",
      wrapSpoken("Full pathway in the app, link in bio."),
      "",
      wrapSpoken(`Pathway: ${episode.pathway}.`),
      "@note Land on the pathway, then stop.",
    ].join("\n"),
    buildReelSection(episode),
  ];

  return `${sections.join("\n\n---\n\n")}\n`;
}

function buildReelSection(episode: DoctrineEpisode) {
  const lines = [
    "# Reel Cues",
    "",
    "Skip this slide",
    "for the full teaching.",
    "",
  ];

  episode.reels.forEach((reel, index) => {
    lines.push(`${index + 1}.`);
    lines.push("Hook.");
    lines.push(wrapSpoken(reel.hook));
    lines.push("");
    lines.push("Clip.");
    lines.push(wrapSpoken(reel.clip));
    lines.push("");
    lines.push("CTA.");
    lines.push(wrapSpoken(reel.cta));
    lines.push("");
  });

  lines.push("@note Clip ideas from the recording plan. They are not part of the teaching read.");
  return lines.join("\n").trimEnd();
}
