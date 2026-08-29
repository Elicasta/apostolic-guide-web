import type { ReactNode } from "react";
import { getSlideLines } from "@/lib/teleprompter/parser";
import type {
  TeleprompterMode,
  TeleprompterSlide,
  TeleprompterTheme,
} from "@/lib/teleprompter/types";

interface SlideContentProps {
  slide: TeleprompterSlide;
  mode: TeleprompterMode;
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

export default function SlideContent({
  slide,
  mode,
  theme,
  fontScale = 1,
  compact = false,
}: SlideContentProps) {
  const night = theme === "night";
  const lines = getSlideLines(slide, mode);
  const bodySize = compact
    ? `clamp(1.05rem, ${2.25 * fontScale}vw, ${1.45 * fontScale}rem)`
    : `clamp(${1.9 * fontScale}rem, ${4.6 * fontScale}vw, ${4.7 * fontScale}rem)`;
  const headingSize = compact
    ? `clamp(.78rem, ${1.5 * fontScale}vw, 1rem)`
    : `clamp(.78rem, 1.35vw, 1.05rem)`;

  return (
    <div
      style={{
        color: night ? "#F2EEE5" : "#191815",
        width: "100%",
        maxWidth: compact ? 720 : 1500,
        margin: "0 auto",
      }}
    >
      {slide.heading ? (
        <div
          style={{
            fontSize: headingSize,
            letterSpacing: "0.19em",
            textTransform: "uppercase",
            color: night ? "#B99A66" : "#8A6B39",
            fontWeight: 700,
            marginBottom: compact ? 14 : "clamp(1.1rem, 3vh, 2.4rem)",
          }}
        >
          {slide.heading}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: compact ? 9 : "clamp(.65rem, 1.7vh, 1.4rem)",
          fontFamily: "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          fontSize: bodySize,
          lineHeight: compact ? 1.28 : 1.13,
          letterSpacing: "-0.025em",
          fontWeight: 520,
          textWrap: "balance",
        }}
      >
        {lines.map((line, index) => {
          const isQuote = slide.quotes.includes(line);
          return (
            <div
              key={`${line}-${index}`}
              style={{
                color: isQuote ? (night ? "#DCC99F" : "#6E532C") : undefined,
                fontStyle: isQuote ? "italic" : undefined,
                borderLeft: isQuote ? `2px solid ${night ? "#8B7046" : "#B3925D"}` : undefined,
                paddingLeft: isQuote ? (compact ? 12 : "clamp(.9rem, 2vw, 1.8rem)") : undefined,
              }}
            >
              {renderInline(line)}
            </div>
          );
        })}
      </div>

      {slide.reference ? (
        <div
          style={{
            marginTop: compact ? 14 : "clamp(1.2rem, 3vh, 2.6rem)",
            fontSize: compact ? ".75rem" : "clamp(.78rem, 1.3vw, 1rem)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 650,
            color: night ? "#97866A" : "#7E735F",
          }}
        >
          {slide.reference}
        </div>
      ) : null}

      {slide.note && mode !== "minimal" ? (
        <div
          style={{
            marginTop: compact ? 14 : "clamp(1.5rem, 4vh, 3.4rem)",
            paddingTop: compact ? 10 : "clamp(.8rem, 1.8vh, 1.3rem)",
            borderTop: `1px solid ${night ? "rgba(185,154,102,.24)" : "rgba(138,107,57,.2)"}`,
            color: night ? "#8E877A" : "#766F63",
            fontSize: compact ? ".78rem" : "clamp(.8rem, 1.45vw, 1.05rem)",
            lineHeight: 1.45,
            letterSpacing: "0.01em",
          }}
        >
          <span
            style={{
              color: night ? "#B99A66" : "#8A6B39",
              fontWeight: 750,
              letterSpacing: ".12em",
              textTransform: "uppercase",
              marginRight: 10,
              fontSize: ".72em",
            }}
          >
            Note
          </span>
          {slide.note}
        </div>
      ) : null}
    </div>
  );
}
