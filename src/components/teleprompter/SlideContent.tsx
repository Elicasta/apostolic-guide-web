import type { CSSProperties, ReactNode } from "react";
import type {
  TeleprompterSlide,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

interface SlideContentProps {
  slide: TeleprompterSlide;
  theme: TeleprompterTheme;
  fontScale?: number;
  compact?: boolean;
}

function renderInline(value: string): ReactNode[] {
  return value
    .split(/(\*\*.*?\*\*)/g)
    .filter(Boolean)
    .map((segment, index) =>
      segment.startsWith("**") && segment.endsWith("**") ? (
        <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>
      ) : (
        <span key={`${segment}-${index}`}>{segment}</span>
      ),
    );
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
}: SlideContentProps) {
  const lines = getReadingLines(slide);

  return (
    <article
      className={`tp-script tp-script-${theme} ${compact ? "tp-script-compact" : ""}`}
      style={{ "--tp-font-scale": fontScale } as CSSProperties}
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
          if (line.quote) {
            return <blockquote key={line.id}>{renderInline(line.text)}</blockquote>;
          }
          return <p key={line.id}>{renderInline(line.text)}</p>;
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
