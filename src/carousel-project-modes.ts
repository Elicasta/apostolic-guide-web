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
  informational: "Create a fresh teaching angle from your prompt while the selected Pathway keeps the doctrine and Scripture grounded.",
  "word-study": "Explore the word, phrase, or text in your prompt using the Pathway as a source bank, not a repeated outline.",
  "verse-connection": "Build a new passage-to-passage insight from your prompt without automatically replaying the whole Pathway.",
  "app-guide": "Teach people how to study the requested idea inside Apostolic Guide using the Pathway as context."
};

export function creativeIntentForCarouselMode(mode: CarouselProjectMode) {
  if (mode === "verse-connection") return "scripture" as const;
  if (mode === "pathway" || mode === "word-study") return "teaching" as const;
  return "information" as const;
}

export function defaultCarouselTopic(mode: CarouselProjectMode, pathway: { title: string; summary: string }) {
  if (mode === "pathway") return `Walk through the ${pathway.title} Pathway in a clear Scripture-first sequence. ${pathway.summary}`;
  if (mode === "informational") return `Choose one fresh, specific teaching angle connected to ${pathway.title}. Use the Pathway as the doctrinal source, but do not simply summarize the whole Pathway.`;
  if (mode === "word-study") return `Choose one key biblical word, phrase, or text that opens a fresh angle on ${pathway.title}. Build around that idea rather than replaying the Pathway outline.`;
  if (mode === "verse-connection") return `Choose one useful connection between passages in ${pathway.title} and make that relationship the creative thesis. Do not cover every Pathway step.`;
  return `Show one practical way someone can use Apostolic Guide to study an idea connected to ${pathway.title}. Keep the Pathway as the example and source context, not the whole script.`;
}

export function carouselModeDirection(mode: CarouselProjectMode) {
  if (mode === "pathway") return "Follow the canonical Pathway flow. The sequence should feel like a guided Scripture study, not a list of disconnected facts. This is the one mode where the Pathway itself is intentionally the outline.";
  if (mode === "informational") return "The user's prompt controls the thesis and emphasis. The Pathway controls doctrine and source material. Select only the passages that serve the requested idea and build the clearest fresh sequence around it.";
  if (mode === "word-study") return "Center the requested biblical word, phrase, or text. Explain its meaning through relevant supplied Pathway passages without turning the post into a full Pathway summary. Do not invent Greek or Hebrew claims that are not present in the source context.";
  if (mode === "verse-connection") return "Build the sequence around one or a few passage-to-passage connections that answer the user's prompt. Each slide should make one relationship between texts easy to see. Do not automatically include every Pathway verse.";
  return "Teach a practical Apostolic Guide study workflow around the user's requested idea: question or topic, relevant Pathway, passages, connections, and next study action. Keep the selected Pathway as context rather than copying its entire sequence.";
}
