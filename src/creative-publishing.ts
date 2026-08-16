export const CREATIVE_PUBLICATION_MODES = ["publish_now", "schedule", "next_available", "finish_manually"] as const;
export type CreativePublicationMode = typeof CREATIVE_PUBLICATION_MODES[number];

export const DEFAULT_PUBLISHING_SLOTS = [
  { hour: 9, minute: 0 },
  { hour: 13, minute: 0 },
  { hour: 18, minute: 30 }
] as const;

export function nextAvailablePublishingSlot(input: {
  now: Date;
  timezoneOffsetMinutes: number;
  occupiedIso: string[];
  slots?: ReadonlyArray<{ hour: number; minute: number }>;
  horizonDays?: number;
}) {
  const offset = Number.isFinite(input.timezoneOffsetMinutes) ? input.timezoneOffsetMinutes : 0;
  const localNow = new Date(input.now.getTime() - offset * 60_000);
  const slots = input.slots?.length ? input.slots : DEFAULT_PUBLISHING_SLOTS;
  const occupied = input.occupiedIso
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const horizonDays = Math.min(60, Math.max(1, input.horizonDays ?? 21));

  for (let day = 0; day < horizonDays; day += 1) {
    for (const slot of slots) {
      const utcMs = Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate() + day,
        slot.hour,
        slot.minute,
        0,
        0
      ) + offset * 60_000;
      if (utcMs <= input.now.getTime() + 5 * 60_000) continue;
      const collision = occupied.some((value) => Math.abs(value - utcMs) < 10 * 60_000);
      if (!collision) return new Date(utcMs).toISOString();
    }
  }
  throw new Error("No publishing slot is available inside the configured horizon.");
}

export function publicationStatusForMode(mode: CreativePublicationMode) {
  return mode === "finish_manually" ? "needs_manual_finish" as const : "scheduled" as const;
}

export function currentRenderSet<T extends {
  frame_id?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  asset?: { public_url?: string | null; metadata?: Record<string, unknown> | null } | null;
}>(links: T[], stateVersion: number, expectedFrames: number) {
  const byFrame = new Map<string, T>();
  for (const link of links) {
    const frameId = link.frame_id || "";
    if (!frameId || !link.asset?.public_url) continue;
    const version = Number(link.asset.metadata?.projectStateVersion ?? -1);
    if (version !== stateVersion) continue;
    const existing = byFrame.get(frameId);
    if (!existing || String(link.created_at || "") > String(existing.created_at || "")) byFrame.set(frameId, link);
  }
  const ordered = Array.from(byFrame.values()).sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  return ordered.length === expectedFrames ? ordered : [];
}
