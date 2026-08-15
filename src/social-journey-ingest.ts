import { upsertInstagramPerson } from "./people-crm";
import { enrollMatchingJourneys } from "./growth-journeys";
import { isSelfAuthoredInstagramComment, type InstagramCommentAuthor } from "./social-messaging";

export async function ingestInstagramJourneys(payload: unknown) {
  if (!payload || typeof payload !== "object") return 0;
  const root = payload as { object?: string; entry?: unknown[] };
  if (root.object !== "instagram" || !Array.isArray(root.entry)) return 0;
  let enrolled = 0;

  for (const entryRaw of root.entry) {
    if (!entryRaw || typeof entryRaw !== "object") continue;
    const entry = entryRaw as { id?: string; messaging?: unknown[]; changes?: unknown[] };

    for (const itemRaw of Array.isArray(entry.messaging) ? entry.messaging : []) {
      if (!itemRaw || typeof itemRaw !== "object") continue;
      const item = itemRaw as { sender?: { id?: string }; timestamp?: number; message?: { mid?: string; text?: string; is_echo?: boolean } };
      if (!item.sender?.id || !item.message?.mid || !item.message.text || item.message.is_echo) continue;
      const at = item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString();
      const person = await upsertInstagramPerson({ instagramUserId: item.sender.id, sourceDetail: "instagram_dm", seenAt: at });
      if (!person) continue;
      const ids = await enrollMatchingJourneys({ personId: person.id, triggerType: "dm_keyword", text: item.message.text, sourceEventId: `message:${item.message.mid}` });
      enrolled += ids.length;
    }

    for (const changeRaw of Array.isArray(entry.changes) ? entry.changes : []) {
      if (!changeRaw || typeof changeRaw !== "object") continue;
      const change = changeRaw as { field?: string; value?: { id?: string; text?: string; from?: InstagramCommentAuthor; media?: { id?: string } } };
      const value = change.value;
      if ((change.field !== "comments" && change.field !== "live_comments") || !value?.id || !value.text || !value.from?.id) continue;
      if (isSelfAuthoredInstagramComment({ entryId: entry.id, from: value.from })) continue;
      const person = await upsertInstagramPerson({ instagramUserId: value.from.id, username: value.from.username ?? null, sourceDetail: "instagram_comment" });
      if (!person) continue;
      const ids = await enrollMatchingJourneys({ personId: person.id, triggerType: "comment_keyword", text: value.text, sourceEventId: `comment:${value.id}` });
      enrolled += ids.length;
    }
  }

  return enrolled;
}
