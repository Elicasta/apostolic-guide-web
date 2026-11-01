import type {
  TeleprompterMode,
  TeleprompterSlide,
  TeleprompterSlideSummary,
} from "./types";

const SLIDE_BREAK = /^\s*---\s*$/m;

export function stripInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .trim();
}

export function parseTeleprompterDocument(content: string): TeleprompterSlide[] {
  const chunks = content
    .split(SLIDE_BREAK)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!chunks.length) {
    return [
      {
        id: "slide-1",
        body: ["Start writing your script in the Library."],
        quotes: [],
        raw: "Start writing your script in the Library.",
      },
    ];
  }

  return chunks.map((raw, index) => {
    const slide: TeleprompterSlide = {
      id: `slide-${index + 1}`,
      body: [],
      quotes: [],
      raw,
    };

    const noteLines: string[] = [];

    for (const originalLine of raw.split("\n")) {
      const line = originalLine.trim();
      if (!line) continue;

      if (line.startsWith("@note ")) {
        noteLines.push(line.slice(6).trim());
        continue;
      }

      if (line.startsWith("@ref ")) {
        slide.reference = line.slice(5).trim();
        continue;
      }

      if (!slide.heading && line.startsWith("# ")) {
        slide.heading = line.slice(2).trim();
        continue;
      }

      if (line.startsWith("> ")) {
        const quote = line.slice(2).trim();
        slide.quotes.push(quote);
        slide.body.push(quote);
        continue;
      }

      slide.body.push(line);
    }

    if (noteLines.length) slide.note = noteLines.join(" ");
    return slide;
  });
}

export function getSlideLines(slide: TeleprompterSlide, mode: TeleprompterMode) {
  const meaningful = slide.body.filter(Boolean);

  if (mode === "script") return meaningful;
  if (mode === "cue") return meaningful.slice(0, 3);

  return [meaningful[0] || slide.heading || slide.reference || "Next thought"];
}

export function summarizeSlides(slides: TeleprompterSlide[]): TeleprompterSlideSummary[] {
  return slides.map((slide) => {
    const preview = stripInlineMarkdown(
      slide.heading || slide.body[0] || slide.reference || "Untitled slide",
    );

    return {
      id: slide.id,
      heading: slide.heading,
      preview: preview.length > 84 ? `${preview.slice(0, 81)}...` : preview,
      reference: slide.reference,
    };
  });
}
