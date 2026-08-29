export const VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES = [
  { value: "logo", label: "Logo / mark" },
  { value: "scripture-frame", label: "Scripture frame" },
  { value: "pathway-frame", label: "Pathway stop" },
  { value: "lower-third", label: "Lower third" },
  { value: "statement", label: "Statement card" },
  { value: "cta", label: "CTA" },
  { value: "texture", label: "Texture" },
  { value: "overlay", label: "Overlay" },
  { value: "other", label: "Other" }
] as const;

export const VIDEO_PRODUCER_GRAPHIC_FORMATS = [
  { value: "podcast", label: "Podcast" },
  { value: "reels", label: "Reels" }
] as const;

export const VIDEO_PRODUCER_GRAPHIC_TEXT_BEHAVIORS = [
  { value: "none", label: "No text" },
  { value: "editable", label: "Replaceable text" },
  { value: "fixed", label: "Fixed text in artwork" }
] as const;

export const VIDEO_PRODUCER_GRAPHIC_ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" }
] as const;

export const VIDEO_PRODUCER_GRAPHIC_REFERENCE_ZONES = [
  { value: "full-frame", label: "Full frame" },
  { value: "safe-center", label: "Safe center" },
  { value: "upper-third", label: "Upper third" },
  { value: "lower-third", label: "Lower third" },
  { value: "left-panel", label: "Left panel" },
  { value: "right-panel", label: "Right panel" }
] as const;

export const VIDEO_PRODUCER_GRAPHIC_DISPLAY_BEHAVIORS = [
  { value: "full-screen", label: "Full screen" },
  { value: "lower-third", label: "Lower third" },
  { value: "persistent", label: "Persistent overlay" }
] as const;

type OptionValue<T extends readonly { value: string }[]> = T[number]["value"];
export type VideoProducerGraphicAssetType = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES>;
export type VideoProducerGraphicFormat = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_FORMATS>;
export type VideoProducerGraphicTextBehavior = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_TEXT_BEHAVIORS>;
export type VideoProducerGraphicAlignment = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_ALIGNMENTS>;
export type VideoProducerGraphicReferenceZone = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_REFERENCE_ZONES>;
export type VideoProducerGraphicDisplayBehavior = OptionValue<typeof VIDEO_PRODUCER_GRAPHIC_DISPLAY_BEHAVIORS>;

export type VideoProducerGraphicAssetAttributes = {
  assetType: VideoProducerGraphicAssetType;
  formats: VideoProducerGraphicFormat[];
  textBehavior: VideoProducerGraphicTextBehavior;
  maxLines: number | null;
  alignment: VideoProducerGraphicAlignment;
  referenceZone: VideoProducerGraphicReferenceZone;
  displayBehavior: VideoProducerGraphicDisplayBehavior;
  fixedText: string | null;
  notes: string | null;
};

function optionValue<T extends readonly { value: string }[]>(
  value: unknown,
  options: T,
  label: string
): OptionValue<T> {
  const normalized = String(value || "").trim();
  if (!options.some((option) => option.value === normalized)) throw new Error(`Unknown ${label}.`);
  return normalized as OptionValue<T>;
}

function limitedText(value: unknown, limit: number) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, limit) : null;
}

export function normalizeVideoProducerGraphicAssetAttributes(input: {
  assetType?: unknown;
  formats?: unknown;
  textBehavior?: unknown;
  maxLines?: unknown;
  alignment?: unknown;
  referenceZone?: unknown;
  displayBehavior?: unknown;
  fixedText?: unknown;
  notes?: unknown;
}): VideoProducerGraphicAssetAttributes {
  const assetType = optionValue(input.assetType, VIDEO_PRODUCER_GRAPHIC_ASSET_TYPES, "graphic asset type");
  const rawFormats = Array.isArray(input.formats) ? input.formats : [];
  const formats = Array.from(new Set(rawFormats.map((value) =>
    optionValue(value, VIDEO_PRODUCER_GRAPHIC_FORMATS, "graphic output format")
  ))) as VideoProducerGraphicFormat[];
  if (!formats.length) throw new Error("Choose Podcast, Reels, or both.");

  const textBehavior = optionValue(input.textBehavior, VIDEO_PRODUCER_GRAPHIC_TEXT_BEHAVIORS, "text behavior");
  let maxLines: number | null = null;
  if (textBehavior !== "none") {
    const parsed = Number(input.maxLines);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) throw new Error("Max lines must be a whole number from 1 to 12.");
    maxLines = parsed;
  }

  const fixedText = textBehavior === "fixed" ? limitedText(input.fixedText, 500) : null;
  if (textBehavior === "fixed" && !fixedText) throw new Error("Fixed-text artwork must include the exact baked-in text.");

  return {
    assetType,
    formats,
    textBehavior,
    maxLines,
    alignment: optionValue(input.alignment, VIDEO_PRODUCER_GRAPHIC_ALIGNMENTS, "text alignment"),
    referenceZone: optionValue(input.referenceZone, VIDEO_PRODUCER_GRAPHIC_REFERENCE_ZONES, "reference zone"),
    displayBehavior: optionValue(input.displayBehavior, VIDEO_PRODUCER_GRAPHIC_DISPLAY_BEHAVIORS, "display behavior"),
    fixedText,
    notes: limitedText(input.notes, 1000)
  };
}

export function videoProducerGraphicAssetPersistence(attributes: VideoProducerGraphicAssetAttributes) {
  return {
    kind: attributes.assetType,
    formats: attributes.formats,
    text_behavior: attributes.textBehavior,
    max_lines: attributes.maxLines,
    text_alignment: attributes.alignment,
    reference_zone: attributes.referenceZone,
    display_behavior: attributes.displayBehavior,
    fixed_text: attributes.fixedText,
    notes: attributes.notes
  };
}

export function serializeVideoProducerGraphicAsset(row: Record<string, unknown>, previewUrl: string) {
  const attributes = normalizeVideoProducerGraphicAssetAttributes({
    assetType: row.kind,
    formats: row.formats,
    textBehavior: row.text_behavior,
    maxLines: row.max_lines,
    alignment: row.text_alignment,
    referenceZone: row.reference_zone,
    displayBehavior: row.display_behavior,
    fixedText: row.fixed_text,
    notes: row.notes
  });
  return {
    id: String(row.id),
    title: String(row.title),
    kind: attributes.assetType,
    assetType: attributes.assetType,
    formats: attributes.formats,
    textBehavior: attributes.textBehavior,
    maxLines: attributes.maxLines,
    alignment: attributes.alignment,
    referenceZone: attributes.referenceZone,
    displayBehavior: attributes.displayBehavior,
    fixedText: attributes.fixedText,
    notes: attributes.notes,
    storageProvider: String(row.storage_provider || ""),
    storageLocator: String(row.storage_locator || ""),
    filename: String(row.filename),
    contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes || 0),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    active: Boolean(row.active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    previewUrl
  };
}
