export type SocialClipCaptionCue = {
  start: number;
  end: number;
  text: string;
};

export type SocialClipPackage = {
  instagramCaption: string;
  tiktokCaption: string;
  hashtags: string[];
  coverHeadline: string;
  coverSubline: string;
  coverUrl: string | null;
  captionCues: SocialClipCaptionCue[];
};

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanHashtag(value: unknown) {
  if (typeof value !== "string") return "";
  const cleaned = value.trim().replace(/^#+/, "").replace(/\s+/g, "");
  return cleaned ? `#${cleaned}` : "";
}

export function normalizeSocialClipPackage(value: unknown): SocialClipPackage {
  const metadata = record(value);
  const social = record(metadata.socialPackage);
  const rawTags = Array.isArray(social.hashtags) ? social.hashtags : [];
  const hashtags = Array.from(new Set(rawTags.map(cleanHashtag).filter(Boolean))).slice(0, 10);
  const rawCues = Array.isArray(metadata.captionCues) ? metadata.captionCues : [];
  const captionCues = rawCues.flatMap((entry) => {
    const cue = record(entry);
    const start = Number(cue.start);
    const end = Number(cue.end);
    const text = cleanString(cue.text);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) return [];
    return [{ start, end, text }];
  });

  return {
    instagramCaption: cleanString(social.instagramCaption),
    tiktokCaption: cleanString(social.tiktokCaption),
    hashtags,
    coverHeadline: cleanString(social.coverHeadline),
    coverSubline: cleanString(social.coverSubline),
    coverUrl: cleanString(social.coverUrl) || null,
    captionCues
  };
}

export function socialClipCaption(value: unknown, platform: "instagram" | "tiktok", fallback = "") {
  const social = normalizeSocialClipPackage(value);
  return (platform === "instagram" ? social.instagramCaption : social.tiktokCaption) || fallback.trim();
}

export function socialClipCaptionWithTags(value: unknown, platform: "instagram" | "tiktok", fallback = "") {
  const social = normalizeSocialClipPackage(value);
  const caption = (platform === "instagram" ? social.instagramCaption : social.tiktokCaption) || fallback.trim();
  const tags = social.hashtags.join(" ");
  return tags ? `${caption}\n\n${tags}`.trim() : caption;
}
