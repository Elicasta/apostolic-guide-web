export const CAROUSEL_PROJECT_MODES = ["pathway", "informational", "word-study", "verse-connection", "app-guide"] as const;
export type CarouselProjectMode = typeof CAROUSEL_PROJECT_MODES[number];

export const CAROUSEL_PROJECT_MODE_LABELS: Record<CarouselProjectMode, string> = {
  pathway: "Pathway Guide",
  informational: "Informational",
  "word-study": "Word Study",
  "verse-connection": "Verse Connections",
  "app-guide": "How to Use the App"
};

export const CAROUSEL_PROJECT_MODE_DESCRIPTIONS: Record<CarouselProjectMode, string> = {
  pathway: "Walk through a live Scripture Pathway in order.",
  informational: "Teach one topic clearly using the selected Pathway as the source.",
  "word-study": "Explore a biblical word, phrase, or text without drifting from the Pathway.",
  "verse-connection": "Show how the Pathway passages connect and illuminate one another.",
  "app-guide": "Teach people how to study the topic inside Apostolic Guide."
};

export function creativeIntentForCarouselMode(mode: CarouselProjectMode) {
  if (mode === "verse-connection") return "scripture" as const;
  if (mode === "pathway" || mode === "word-study") return "teaching" as const;
  return "information" as const;
}

export function defaultCarouselTopic(mode: CarouselProjectMode, pathway: { title: string; summary: string }) {
  if (mode === "pathway") return `Walk through the ${pathway.title} Pathway in a clear Scripture-first sequence. ${pathway.summary}`;
  if (mode === "informational") return `Explain ${pathway.title} clearly and progressively using the strongest passages in this Pathway.`;
  if (mode === "word-study") return `Explore the key biblical words, phrases, and texts that clarify ${pathway.title}.`;
  if (mode === "verse-connection") return `Show how the key passages in ${pathway.title} connect and interpret one another.`;
  return `Show how someone can use Apostolic Guide to study ${pathway.title}, follow its Scripture connections, and continue the Pathway.`;
}

export function carouselModeDirection(mode: CarouselProjectMode) {
  if (mode === "pathway") return "Follow the canonical Pathway flow. The sequence should feel like a guided Scripture study, not a list of disconnected facts.";
  if (mode === "informational") return "Teach the requested topic in the clearest useful sequence. The Pathway controls doctrine and source material, while the user's topic controls emphasis.";
  if (mode === "word-study") return "Center the requested biblical word, phrase, or text. Explain its meaning through the supplied Pathway passages. Do not invent Greek or Hebrew claims that are not present in the source context.";
  if (mode === "verse-connection") return "Build the sequence around passage-to-passage connections. Each slide should make one relationship between texts easy to see.";
  return "Teach a practical Apostolic Guide study workflow: question or topic, Pathway, passages, connections, and the next study action. Keep the selected Pathway as the example context.";
}
