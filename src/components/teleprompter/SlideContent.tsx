import type { CSSProperties, ReactNode } from "react";
import { tokenizeSpeech } from "@/lib/teleprompter/voice-follow";
import { highlightedWordIndex, splitSpokenWordParts } from "@/lib/teleprompter/word-highlighting";
import type {
  TeleprompterSlide,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

interface SlideContentProps {
  slide: TeleprompterSlide;
  theme: TeleprompterTheme;
  fontScale?: number;
  compact?: boolean;
  voiceActive?: boolean;
  voiceWordIndex?: number;
  voiceMode?: "paused" | "following" | "improvising" | "reacquiring";
}

/** Render each speakable word separately without losing bold styling or punctuation. */
function renderInline(value: string, startWord: number, activeWord: number | null): ReactNode[] {
  let nextWord = startWord;
  return value
    .split(/(\*\*.*?\*\*)/g)
    .filter(Boolean)
    .map((segment, index) => {
      const emphasized = segment.startsWith("**") && segment.endsWith("**");
      const content = emphasized ? segment.slice(2, -2) : segment;
      const baseIndex = nextWord;
      nextWord += tokenizeSpeech(content).length;
      const children = splitSpokenWordParts(content).map((part, partIndex) => {
        if (part.wordOffset === null) return <span key={partIndex}>{part.text}</span>;
        const absoluteIndex = baseIndex + part.wordOffset;
        return (
          <span
            key={partIndex}
            className={activeWord === absoluteIndex ? "tp-voice-word tp-voice-word-current" : "tp-voice-word"}
            data-tp-word-index={absoluteIndex}
            data-tp-current-word={activeWord === absoluteIndex ? "true" : undefined}
          >
            {part.text}
          </span>
        );
      });

      return emphasized
        ? <strong key={index}>{children}</strong>
        : <span key={index}>{children}</span>;
    });
}

interface ReadingLine {
  id: string;
  text: string;
  quote: boolean;
  spacer: boolean;
}

function getReadingLines(slide: TeleprompterSlide): ReadingLine[] {
  const lines: ReadingLine[] = [];

  slide.raw.split("\n").forEach((originalLine, index) => {
    const trimmed = originalLine.trim();
    if (!trimmed) {
      if (lines.length && !lines[lines.length - 1].spacer) {
        lines.push({ id: `space-${index}`, text: "", quote: false, spacer: true });
      }
      return;
    }
    if (
      trimmed.startsWith("# ") ||
      trimmed.startsWith("@note ") ||
      trimmed.startsWith("@ref ")
    ) {
      return;
    }

    const quote = trimmed.startsWith("> ");
    lines.push({
      id: `line-${index}`,
      text: quote ? trimmed.slice(2).trim() : trimmed,
      quote,
      spacer: false,
    });
  });

  return lines;
}

export default function SlideContent({
  slide,
  theme,
  fontScale = 1,
  compact = false,
  voiceActive = false,
  voiceWordIndex = 0,
  voiceMode = "paused",
}: SlideContentProps) {
  const lines = getReadingLines(slide);
  const totalWords = lines.reduce((count, line) =>
    count + (line.spacer ? 0 : tokenizeSpeech(line.text.replace(/\*\*/g, "")).length), 0);
  const currentWord = voiceActive && !compact ? highlightedWordIndex(voiceWordIndex, totalWords) : null;
  let spokenWords = 0;

  return (
    <article
      className={`tp-script tp-script-${theme} ${compact ? "tp-script-compact" : ""}`}
      style={{ "--tp-font-scale": fontScale } as CSSProperties}
      data-tp-voice-mode={voiceActive ? voiceMode : undefined}
    >
      {slide.heading ? (
        <header className="tp-script-header">
          <span className="tp-script-rule" aria-hidden="true" />
          <h1>{slide.heading}</h1>
          {slide.reference ? <div>{slide.reference}</div> : null}
        </header>
      ) : null}

      <div className="tp-script-body">
        {lines.map((line) => {
          if (line.spacer) {
            return <div key={line.id} className="tp-script-spacer" aria-hidden="true" />;
          }
          const start = spokenWords;
          spokenWords += tokenizeSpeech(line.text.replace(/\*\*/g, "")).length;
          const activeLine = currentWord !== null && currentWord >= start && currentWord < spokenWords;
          const lineAttributes = {
            "data-tp-word-start": start,
            "data-tp-word-end": spokenWords,
            "data-tp-active-line": activeLine ? "true" : undefined,
            className: activeLine ? "tp-voice-active-line" : undefined,
          };
          if (line.quote) {
            return <blockquote key={line.id} {...lineAttributes}>{renderInline(line.text, start, currentWord)}</blockquote>;
          }
          return <p key={line.id} {...lineAttributes}>{renderInline(line.text, start, currentWord)}</p>;
        })}
      </div>

      {slide.note ? (
        <aside className="tp-speaker-note">
          <span>Note</span>
          {slide.note}
        </aside>
      ) : null}
    </article>
  );
}
