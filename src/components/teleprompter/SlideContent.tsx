import type { ReactNode } from "react";
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
  const segments = value.split(/(\*\*.*?\*\*)/g).filter(Boolean);

  return segments.map((segment, index) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return <strong key={`${segment}-${index}`}>{segment.slice(2, -2)}</strong>;
    }
    return <span key={`${segment}-${index}`}>{segment}</span>;
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

    if (trimmed.startsWith("# ") || trimmed.startsWith("@note ") || trimmed.startsWith("@ref ")) return;

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
  const night = theme === "night";
  const lines = getReadingLines(slide);
  const bodySize = compact
    ? `clamp(1rem, ${1.7 * fontScale}vw, ${1.3 * fontScale}rem)`
    : `clamp(${1.25 * fontScale}rem, ${2.15 * fontScale}vw, ${2.05 * fontScale}rem)`;

  return (
    <article
      style={{
        color: night ? "#F2EEE5" : "#191815",
        width: "100%",
        maxWidth: compact ? 760 : 980,
        margin: "0 auto",
      }}
    >
      {slide.heading ? (
        <header style={{ marginBottom: compact ? 24 : "clamp(2rem, 5vh, 4.5rem)" }}>
          <div
            style={{
              width: compact ? 28 : 38,
              height: 2,
              background: night ? "#9A7D50" : "#8A6B39",
              marginBottom: compact ? 14 : 22,
            }}
          />
          <h1
            style={{
              margin: 0,
              maxWidth: 900,
              fontSize: compact ? "clamp(1.35rem, 2.4vw, 1.8rem)" : "clamp(2rem, 4vw, 3.8rem)",
              lineHeight: 1.02,
              letterSpacing: "-.045em",
              fontWeight: 680,
              color: night ? "#F5F0E7" : "#171612",
            }}
          >
            {slide.heading}
          </h1>
          {slide.reference ? (
            <div
              style={{
                marginTop: compact ? 10 : 16,
                color: night ? "#A99067" : "#826538",
                fontSize: compact ? 11 : "clamp(.72rem, 1.15vw, .9rem)",
                letterSpacing: ".14em",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {slide.reference}
            </div>
          ) : null}
        </header>
      ) : null}

      <div
        style={{
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          fontSize: bodySize,
          lineHeight: compact ? 1.42 : 1.5,
          letterSpacing: "-.018em",
          fontWeight: 460,
          textWrap: "pretty",
        }}
      >
        {lines.map((line) => {
          if (line.spacer) {
            return <div key={line.id} aria-hidden="true" style={{ height: compact ? 11 : "clamp(.8rem, 1.8vh, 1.4rem)" }} />;
          }

          if (line.quote) {
            return (
              <blockquote
                key={line.id}
                style={{
                  margin: compact ? "8px 0" : "clamp(1rem, 2.4vh, 1.8rem) 0",
                  paddingLeft: compact ? 14 : "clamp(1rem, 2.5vw, 1.8rem)",
                  borderLeft: `2px solid ${night ? "#8B7046" : "#A98650"}`,
                  color: night ? "#D9C69E" : "#654C29",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                  lineHeight: 1.42,
                }}
              >
                {renderInline(line.text)}
              </blockquote>
            );
          }

          return (
            <p key={line.id} style={{ margin: 0 }}>
              {renderInline(line.text)}
            </p>
          );
        })}
      </div>

      {slide.note ? (
        <aside
          style={{
            marginTop: compact ? 24 : "clamp(3rem, 7vh, 6rem)",
            paddingLeft: compact ? 12 : 16,
            borderLeft: `1px solid ${night ? "rgba(185,154,102,.38)" : "rgba(138,107,57,.32)"}`,
            color: night ? "#7F796E" : "#766F63",
            fontSize: compact ? ".76rem" : "clamp(.76rem, 1.18vw, .95rem)",
            lineHeight: 1.55,
          }}
        >
          <span
            style={{
              color: night ? "#AA8F63" : "#84683D",
              fontWeight: 760,
              letterSpacing: ".13em",
              textTransform: "uppercase",
              marginRight: 10,
              fontSize: ".72em",
            }}
          >
            Note
          </span>
          {slide.note}
        </aside>
      ) : null}
    </article>
  );
}
