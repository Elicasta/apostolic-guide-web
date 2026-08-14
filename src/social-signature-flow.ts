export const SOCIAL_SIGNATURE_FLOW = "you-found-the-study";

function titleCaseSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.length <= 2 && word !== "is" ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ")
    .replace(/\bIs\b/g, "Is")
    .replace(/\bOf\b/g, "of")
    .replace(/\bThe\b/g, "The");
}

export function studyTitleFromDestination(destinationUrl: string | null | undefined, fallback = "Apostolic Guide Study") {
  const raw = destinationUrl?.trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    const pieces = url.pathname.split("/").filter(Boolean);
    const slug = pieces.at(-1);
    if (slug) return titleCaseSlug(slug);
  } catch {}
  return fallback;
}

export function buildStudyHandshake(title: string) {
  return `You found the study.\n\nI have the ${title} study ready for you. Reply OPEN and I’ll bring it into the chat.`;
}

export function isOpenStudyReply(text: string) {
  const normalized = text.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized === "open" || normalized === "open study" || normalized === "open it";
}

export function buildStudyIntroText() {
  return "Here you go.\n\nStart with Scripture. Follow the key passages and connections, then see how they come together.\n\nIf something raises a question, send it here. I’ll help you work through it from Scripture.";
}

export function buildStudyCardMessage(input: { title: string; destinationUrl: string }) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: input.title,
        buttons: [
          {
            type: "web_url",
            url: input.destinationUrl,
            title: "Open the Study"
          }
        ]
      }
    }
  };
}
